import Meyda from 'meyda';

export interface AudioFeatures {
  rms: number;
  zcr: number;
  mfcc: number[];
  spectralCentroid: number;
  spectralRolloff: number;
}

export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyzer: any = null;

  async init(stream: MediaStream) {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.source = this.audioContext.createMediaStreamSource(stream);
    
    // Meyda setup
    Meyda.bufferSize = 512;
    Meyda.sampleRate = this.audioContext.sampleRate;
    Meyda.audioContext = this.audioContext;
  }

  start(onFeatures: (features: Partial<AudioFeatures>) => void) {
    if (!this.source) return;

    this.analyzer = Meyda.createMeydaAnalyzer({
      audioContext: this.audioContext!,
      source: this.source,
      bufferSize: 512,
      featureExtractors: ['rms', 'zcr', 'mfcc', 'spectralCentroid', 'spectralRolloff'],
      callback: (features: AudioFeatures) => {
        onFeatures(features);
      },
    });

    this.analyzer.start();
  }

  stop() {
    if (this.analyzer) {
      this.analyzer.stop();
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}
