import { ElevenLabsClient } from 'elevenlabs';
import WebSocket from 'ws';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=elevenlabs',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || !connectionSettings.settings.api_key) {
    throw new Error('ElevenLabs not connected');
  }
  return connectionSettings.settings.api_key;
}

export async function getUncachableElevenLabsClient() {
  const apiKey = await getCredentials();
  return new ElevenLabsClient({ apiKey });
}

export async function getElevenLabsApiKey() {
  return await getCredentials();
}

const VOICE_ID = "Xb7hH8MSUJpSbSDYk0k2";

export async function textToSpeechSimple(
  text: string,
  voiceId: string = VOICE_ID
): Promise<Buffer> {
  const apiKey = await getCredentials();

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error("TTS failed: " + response.statusText);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function transcribeAudio(audioBuffer: Buffer, filename: string): Promise<string> {
  const apiKey = await getCredentials();

  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer]), filename);
  formData.append('model_id', 'scribe_v1');

  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Transcription failed: ' + response.statusText);
  }

  const result = await response.json();
  return result.text;
}

export async function createElevenLabsStreamingTTS(
  voiceId: string,
  onAudioChunk: (audioBase64: string) => void,
  options: { modelId?: string; outputFormat?: string } = {}
) {
  const { modelId = 'eleven_flash_v2_5', outputFormat = 'pcm_16000' } = options;
  const apiKey = await getCredentials();
  const uri = 'wss://api.elevenlabs.io/v1/text-to-speech/' + voiceId + '/stream-input?model_id=' + modelId + '&output_format=' + outputFormat;

  const websocket = new WebSocket(uri, {
    headers: { 'xi-api-key': apiKey },
  });

  return new Promise<{
    send: (text: string) => void;
    flush: () => void;
    close: () => void;
  }>((resolve, reject) => {
    websocket.on('error', reject);

    websocket.on('open', () => {
      websocket.send(JSON.stringify({
        text: ' ',
        voice_settings: { stability: 0.5, similarity_boost: 0.8, use_speaker_boost: false },
        generation_config: { chunk_length_schedule: [120, 160, 250, 290] },
      }));

      resolve({
        send: (text: string) => {
          websocket.send(JSON.stringify({ text }));
        },
        flush: () => {
          websocket.send(JSON.stringify({ text: ' ', flush: true }));
        },
        close: () => {
          websocket.send(JSON.stringify({ text: '' }));
        },
      });
    });

    websocket.on('message', (event) => {
      const data = JSON.parse(event.toString());
      if (data.audio) {
        onAudioChunk(data.audio);
      }
    });
  });
}
