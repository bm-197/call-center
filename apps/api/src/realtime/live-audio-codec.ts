const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

const MULAW_DECODE_TABLE = new Int16Array([
  -32124, -31100, -30076, -29052, -28028, -27004, -25980, -24956, -23932,
  -22908, -21884, -20860, -19836, -18812, -17788, -16764, -15996, -15484,
  -14972, -14460, -13948, -13436, -12924, -12412, -11900, -11388, -10876,
  -10364, -9852, -9340, -8828, -8316, -7932, -7676, -7420, -7164, -6908, -6652,
  -6396, -6140, -5884, -5628, -5372, -5116, -4860, -4604, -4348, -4092, -3900,
  -3772, -3644, -3516, -3388, -3260, -3132, -3004, -2876, -2748, -2620, -2492,
  -2364, -2236, -2108, -1980, -1884, -1820, -1756, -1692, -1628, -1564, -1500,
  -1436, -1372, -1308, -1244, -1180, -1116, -1052, -988, -924, -876, -844, -812,
  -780, -748, -716, -684, -652, -620, -588, -556, -524, -492, -460, -428, -396,
  -372, -356, -340, -324, -308, -292, -276, -260, -244, -228, -212, -196, -180,
  -164, -148, -132, -120, -112, -104, -96, -88, -80, -72, -64, -56, -48, -40,
  -32, -24, -16, -8, 0, 32124, 31100, 30076, 29052, 28028, 27004, 25980, 24956,
  23932, 22908, 21884, 20860, 19836, 18812, 17788, 16764, 15996, 15484, 14972,
  14460, 13948, 13436, 12924, 12412, 11900, 11388, 10876, 10364, 9852, 9340,
  8828, 8316, 7932, 7676, 7420, 7164, 6908, 6652, 6396, 6140, 5884, 5628, 5372,
  5116, 4860, 4604, 4348, 4092, 3900, 3772, 3644, 3516, 3388, 3260, 3132, 3004,
  2876, 2748, 2620, 2492, 2364, 2236, 2108, 1980, 1884, 1820, 1756, 1692, 1628,
  1564, 1500, 1436, 1372, 1308, 1244, 1180, 1116, 1052, 988, 924, 876, 844, 812,
  780, 748, 716, 684, 652, 620, 588, 556, 524, 492, 460, 428, 396, 372, 356,
  340, 324, 308, 292, 276, 260, 244, 228, 212, 196, 180, 164, 148, 132, 120,
  112, 104, 96, 88, 80, 72, 64, 56, 48, 40, 32, 24, 16, 8, 0,
]);

export const PHONE_SAMPLE_RATE = 8000;
export const GEMINI_INPUT_SAMPLE_RATE = 16000;
export const GEMINI_OUTPUT_SAMPLE_RATE = 24000;

export function mulawToPcm16(mulaw: Buffer): Int16Array {
  const pcm = new Int16Array(mulaw.length);
  for (let i = 0; i < mulaw.length; i += 1) {
    pcm[i] = MULAW_DECODE_TABLE[mulaw[i]!]!;
  }
  return pcm;
}

export function pcm16ToMulaw(samples: Int16Array): Buffer {
  const out = Buffer.allocUnsafe(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    out[i] = linearToMulaw(samples[i]!);
  }
  return out;
}

export function resamplePcm16(
  samples: Int16Array,
  sourceRate: number,
  targetRate: number,
): Int16Array {
  if (sourceRate === targetRate) return samples;
  if (samples.length === 0) return new Int16Array(0);

  const targetLength = Math.max(
    1,
    Math.round((samples.length * targetRate) / sourceRate),
  );
  const output = new Int16Array(targetLength);
  const ratio = sourceRate / targetRate;

  for (let i = 0; i < targetLength; i += 1) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, samples.length - 1);
    const weight = position - left;
    output[i] = clamp16(
      samples[left]! * (1 - weight) + samples[right]! * weight,
    );
  }

  return output;
}

export function mulaw8kToGeminiPcm16Base64(mulaw: Buffer): string {
  const pcm8k = mulawToPcm16(mulaw);
  const pcm16k = resamplePcm16(
    pcm8k,
    PHONE_SAMPLE_RATE,
    GEMINI_INPUT_SAMPLE_RATE,
  );
  return pcm16ToBuffer(pcm16k).toString('base64');
}

export function geminiPcm16Base64ToMulaw8k(
  base64: string,
  sourceRate = GEMINI_OUTPUT_SAMPLE_RATE,
): Buffer {
  const pcm = bufferToPcm16(Buffer.from(base64, 'base64'));
  const pcm8k = resamplePcm16(pcm, sourceRate, PHONE_SAMPLE_RATE);
  return pcm16ToMulaw(pcm8k);
}

export function parsePcmRate(mimeType: string | undefined): number {
  const match = mimeType?.match(/rate=(\d+)/i);
  return match ? Number(match[1]) : GEMINI_OUTPUT_SAMPLE_RATE;
}

function bufferToPcm16(buffer: Buffer): Int16Array {
  const samples = new Int16Array(Math.floor(buffer.length / 2));
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = buffer.readInt16LE(i * 2);
  }
  return samples;
}

function pcm16ToBuffer(samples: Int16Array): Buffer {
  const buffer = Buffer.allocUnsafe(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(samples[i]!, i * 2);
  }
  return buffer;
}

function linearToMulaw(sample: number): number {
  let pcm = clamp16(sample);
  let sign = (pcm >> 8) & 0x80;
  if (sign !== 0) pcm = -pcm;
  if (pcm > MULAW_CLIP) pcm = MULAW_CLIP;

  pcm += MULAW_BIAS;
  let exponent = 7;
  for (
    let expMask = 0x4000;
    (pcm & expMask) === 0 && exponent > 0;
    expMask >>= 1
  ) {
    exponent -= 1;
  }

  const mantissa = (pcm >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

function clamp16(value: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(value)));
}
