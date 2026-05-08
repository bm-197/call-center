/**
 * AudioBridge — UDP/RTP receiver + sender for one call.
 *
 * Asterisk ARI's externalMedia opens an RTP-over-UDP channel that streams
 * raw audio to a host:port we provide. This class wraps that:
 *
 *   1. open() binds an ephemeral UDP socket and returns its port. The
 *      caller passes "host.docker.internal:<port>" to Asterisk so the
 *      container can reach our Node process on the host.
 *   2. On each incoming RTP packet, we strip the 12-byte header and emit
 *      the raw audio payload as an "audio" event.
 *   3. send(payload) wraps audio in a minimal valid RTP packet and sends
 *      it back to Asterisk's source address. (Used for AI playback later.)
 *   4. close() releases the socket.
 *
 * Audio format is ulaw 8kHz, 20ms frames = 160 bytes/packet. That's the
 * default for SIP and what Intervo's twilioHandler uses, so we stay on
 * the same wire format end-to-end.
 */

import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';

const RTP_HEADER_SIZE = 12;
const PAYLOAD_TYPE_PCMU = 0; // µ-law / G.711
const SAMPLES_PER_FRAME = 160; // 20ms @ 8kHz

export class AudioBridge extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private remote: { address: string; port: number } | null = null;

  // Outgoing RTP state
  private seq = Math.floor(Math.random() * 0xffff);
  private timestamp = Math.floor(Math.random() * 0xffffffff);
  private readonly ssrc = Math.floor(Math.random() * 0xffffffff);

  /** Bind to an ephemeral UDP port. Returns the bound port. */
  async open(): Promise<number> {
    return new Promise((resolve, reject) => {
      const sock = dgram.createSocket('udp4');
      sock.once('error', reject);
      sock.bind(0, '0.0.0.0', () => {
        const addr = sock.address();
        if (typeof addr === 'string') {
          reject(new Error('Unexpected unix-socket address'));
          return;
        }
        this.socket = sock;
        sock.removeListener('error', reject);
        sock.on('error', (err) => this.emit('error', err));
        sock.on('message', (msg, rinfo) => this.onPacket(msg, rinfo));
        resolve(addr.port);
      });
    });
  }

  private onPacket(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    if (msg.length < RTP_HEADER_SIZE) return;

    // Capture remote so we can reply
    if (!this.remote) {
      this.remote = { address: rinfo.address, port: rinfo.port };
      this.emit('remote', this.remote);
    }

    const payload = msg.subarray(RTP_HEADER_SIZE);
    if (payload.length === 0) return;
    this.emit('audio', payload);
  }

  /**
   * Send a chunk of µ-law audio back to Asterisk. The chunk should be
   * 160 bytes (20ms) for typical streaming. Larger chunks are split.
   */
  send(payload: Buffer): void {
    if (!this.socket || !this.remote) return;

    for (let offset = 0; offset < payload.length; offset += SAMPLES_PER_FRAME) {
      const frame = payload.subarray(offset, offset + SAMPLES_PER_FRAME);
      const packet = this.buildRtpPacket(frame);
      this.socket.send(packet, this.remote.port, this.remote.address);
      this.seq = (this.seq + 1) & 0xffff;
      this.timestamp = (this.timestamp + frame.length) >>> 0;
      // Mirror the outbound µ-law frame so a recorder can capture the
      // AI side of the call without intercepting send().
      this.emit('outbound', frame);
    }
  }

  private buildRtpPacket(payload: Buffer): Buffer {
    const header = Buffer.alloc(RTP_HEADER_SIZE);
    header[0] = 0x80; // V=2, P=0, X=0, CC=0
    header[1] = PAYLOAD_TYPE_PCMU & 0x7f; // M=0, PT=0
    header.writeUInt16BE(this.seq, 2);
    header.writeUInt32BE(this.timestamp, 4);
    header.writeUInt32BE(this.ssrc, 8);
    return Buffer.concat([header, payload]);
  }

  close(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore
      }
      this.socket = null;
    }
    this.remote = null;
    this.removeAllListeners();
  }
}
