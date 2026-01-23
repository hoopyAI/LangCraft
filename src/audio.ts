import * as fs from 'fs';
import * as path from 'path';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

let speechConfig: sdk.SpeechConfig | null = null;

export const initializeSpeechSynthesizer = (subscriptionKey: string, region: string, voiceName?: string) => {
  speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);
  if (voiceName) {
    speechConfig.speechSynthesisVoiceName = voiceName;
  }
  speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm;
};

export interface SynthesizedAudioMeta {
  filePath: string;
  duration?: number;
}

export const synthesizeAudioToFile = async (text: string, outputFilePath: string): Promise<SynthesizedAudioMeta> => {
  if (!speechConfig) {
    throw new Error('Speech synthesizer is not initialized');
  }

  await fs.promises.mkdir(path.dirname(outputFilePath), { recursive: true });

  return new Promise((resolve, reject) => {
    const audioConfig = sdk.AudioConfig.fromAudioFileOutput(outputFilePath);
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig!, audioConfig);

    synthesizer.speakTextAsync(
      text,
      (result: sdk.SpeechSynthesisResult) => {
        synthesizer.close();
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          resolve({ filePath: outputFilePath, duration: result.audioDuration });
        } else {
          reject(new Error(`Speech synthesis failed: ${result.reason}`));
        }
      },
      (error: string) => {
        synthesizer.close();
        fs.promises.unlink(outputFilePath).catch(() => undefined);
        reject(error);
      }
    );
  });
};
