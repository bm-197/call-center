import textToSpeech from '@google-cloud/text-to-speech';

const client = new textToSpeech.TextToSpeechClient();

type SynthOptions = {
  text: string;
  languageCode: string;
  voiceName: string;
};

export async function synthesizeMulaw(opts: SynthOptions): Promise<Buffer> {
  const [response] = await client.synthesizeSpeech({
    input: { text: opts.text },
    voice: { languageCode: opts.languageCode, name: opts.voiceName },
    audioConfig: { audioEncoding: 'MULAW', sampleRateHertz: 8000 },
  });
  const audio = response.audioContent;
  if (!audio) throw new Error('TTS returned empty audio');
  return Buffer.isBuffer(audio) ? audio : Buffer.from(audio);
}
