#!/usr/bin/env node
import 'dotenv/config';
import { GoogleGenAI, Modality } from '@google/genai';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { platform } from 'node:os';

const MODEL = process.env.GEMINI_LIVE_MODEL ?? 'gemini-3.1-flash-live-preview';
const OUT_PCM = process.env.GEMINI_LIVE_OUT_PCM ?? 'gemini-live-response.pcm';
const OUT_WAV = process.env.GEMINI_LIVE_OUT_WAV ?? 'gemini-live-response.wav';
const PCM_RATE = 16_000;
const FRAME_BYTES = 3_200; // 100ms of 16kHz mono signed 16-bit PCM.
const TRANSCRIPTION_LANGUAGE_CODE = 'am';

if (!process.env.GEMINI_API_KEY) {
  console.error('Set GEMINI_API_KEY first.');
  process.exit(1);
}

if (existsSync(OUT_PCM)) rmSync(OUT_PCM);
if (existsSync(OUT_WAV)) rmSync(OUT_WAV);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

let recorder = null;
let recording = false;
let audioBuffer = Buffer.alloc(0);
let gotAudio = false;
let turnOpen = false;

const session = await ai.live.connect({
  model: MODEL,
  config: {
    responseModalities: [Modality.AUDIO],
    speechConfig: { languageCode: TRANSCRIPTION_LANGUAGE_CODE },
    inputAudioTranscription: {
      languageCodes: [TRANSCRIPTION_LANGUAGE_CODE],
    },
    outputAudioTranscription: {
      languageCodes: [TRANSCRIPTION_LANGUAGE_CODE],
    },
    realtimeInputConfig: {
      automaticActivityDetection: {
        disabled: true,
      },
    },
    systemInstruction:
      'You are an Amharic phone agent. Understand the user audio directly and respond naturally in Amharic. Keep the response short and conversational.',
  },
  callbacks: {
    onopen: () => {
      console.log(`Gemini Live opened: ${MODEL}`);
      printControls();
    },
    onmessage: (msg) => handleGeminiMessage(msg),
    onerror: (e) => console.error('\nGemini error:', e.message ?? e),
    onclose: (e) => {
      console.log('\nGemini closed:', e.reason || '(no reason)');
      cleanupTerminal();
    },
  },
});

setupKeyboard();

function printControls() {
  console.log('\nControls:');
  console.log('  SPACE  start streaming mic audio');
  console.log('  SPACE  stop streaming and ask Gemini to respond');
  console.log('  q      quit');
  console.log('\nWaiting. Press SPACE to start.');
}

function setupKeyboard() {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (buf) => {
    const key = buf.toString('utf8');
    if (key === ' ') {
      if (recording) stopRecording();
      else startRecording();
      return;
    }
    if (key === 'q' || buf[0] === 3) {
      shutdown();
    }
  });
}

function startRecording() {
  if (recording) return;
  recording = true;
  gotAudio = false;
  audioBuffer = Buffer.alloc(0);
  if (existsSync(OUT_PCM)) rmSync(OUT_PCM);
  if (existsSync(OUT_WAV)) rmSync(OUT_WAV);

  if (!turnOpen) {
    session.sendRealtimeInput({ activityStart: {} });
    turnOpen = true;
  }

  const { args, label } = ffmpegMicCommand();
  console.log(`\nRecording from ${label}. Press SPACE again when done.`);

  recorder = spawn('ffmpeg', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  recorder.stdout.on('data', (chunk) => {
    gotAudio = true;
    audioBuffer = Buffer.concat([audioBuffer, chunk]);
    flushAudioFrames();
  });

  recorder.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) console.error(`[ffmpeg] ${text}`);
  });

  recorder.on('exit', () => {
    recorder = null;
    flushAudioFrames(true);
  });
}

function stopRecording() {
  if (!recording) return;
  recording = false;
  console.log('\nStopped. Waiting for Gemini response...');

  if (recorder) {
    recorder.kill('SIGTERM');
  } else {
    flushAudioFrames(true);
  }

  if (turnOpen) {
    session.sendRealtimeInput({ activityEnd: {} });
    turnOpen = false;
  }

  if (!gotAudio) {
    console.log(
      'No audio chunks were captured. Check your ffmpeg microphone input.',
    );
  }
}

function flushAudioFrames(force = false) {
  while (audioBuffer.length >= FRAME_BYTES) {
    sendPcm(audioBuffer.subarray(0, FRAME_BYTES));
    audioBuffer = audioBuffer.subarray(FRAME_BYTES);
  }
  if (force && audioBuffer.length > 0) {
    sendPcm(audioBuffer);
    audioBuffer = Buffer.alloc(0);
  }
}

function sendPcm(pcm) {
  session.sendRealtimeInput({
    audio: {
      data: pcm.toString('base64'),
      mimeType: `audio/pcm;rate=${PCM_RATE}`,
    },
  });
}

function handleGeminiMessage(msg) {
  const inputText = msg.serverContent?.inputTranscription?.text;
  if (inputText) {
    process.stdout.write(`\nUSER: ${inputText}`);
  }

  const outputText = msg.serverContent?.outputTranscription?.text;
  if (outputText) {
    process.stdout.write(`\nGEMINI: ${outputText}`);
  }

  for (const part of msg.serverContent?.modelTurn?.parts ?? []) {
    const audio = part.inlineData?.data;
    if (audio) {
      appendFileSync(OUT_PCM, Buffer.from(audio, 'base64'));
    }
  }

  if (msg.serverContent?.turnComplete) {
    console.log('\nTurn complete.');
    if (existsSync(OUT_PCM)) {
      convertResponseToWav();
      console.log(`Saved response audio: ${OUT_WAV}`);
    }
    console.log('\nPress SPACE to ask another question, or q to quit.');
  }
}

function convertResponseToWav() {
  const result = spawnSync('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    's16le',
    '-ar',
    '24000',
    '-ac',
    '1',
    '-i',
    OUT_PCM,
    OUT_WAV,
  ]);
  if (result.error) {
    console.error(`Could not convert response audio: ${result.error.message}`);
  } else if (result.status !== 0) {
    console.error(
      `ffmpeg response conversion failed: ${result.stderr.toString()}`,
    );
  }
}

function ffmpegMicCommand() {
  if (process.env.GEMINI_FFMPEG_ARGS) {
    return {
      args: process.env.GEMINI_FFMPEG_ARGS.split(' '),
      label: `custom args: ${process.env.GEMINI_FFMPEG_ARGS}`,
    };
  }

  if (platform() === 'darwin') {
    const input = process.env.GEMINI_MIC_INPUT ?? ':0';
    return {
      label: `macOS avfoundation input ${input}`,
      args: [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'avfoundation',
        '-i',
        input,
        '-ac',
        '1',
        '-ar',
        String(PCM_RATE),
        '-f',
        's16le',
        '-acodec',
        'pcm_s16le',
        'pipe:1',
      ],
    };
  }

  if (platform() === 'linux') {
    const input = process.env.GEMINI_MIC_INPUT ?? 'default';
    return {
      label: `Linux ALSA input ${input}`,
      args: [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'alsa',
        '-i',
        input,
        '-ac',
        '1',
        '-ar',
        String(PCM_RATE),
        '-f',
        's16le',
        '-acodec',
        'pcm_s16le',
        'pipe:1',
      ],
    };
  }

  throw new Error(
    'Unsupported OS for default mic capture. Set GEMINI_FFMPEG_ARGS manually.',
  );
}

function cleanupTerminal() {
  if (process.stdin.isRaw) process.stdin.setRawMode(false);
  process.stdin.pause();
}

function shutdown() {
  console.log('\nShutting down.');
  if (recorder) recorder.kill('SIGTERM');
  session.close();
  cleanupTerminal();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
