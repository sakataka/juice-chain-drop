declare module "jsfxr" {
  export type SfxrPreset =
    | "pickupCoin"
    | "laserShoot"
    | "explosion"
    | "powerUp"
    | "hitHurt"
    | "jump"
    | "blipSelect"
    | "synth"
    | "tone"
    | "click"
    | "random";

  export type SfxrDefinition = {
    oldParams: true;
    wave_type: number;
    p_env_attack: number;
    p_env_sustain: number;
    p_env_punch: number;
    p_env_decay: number;
    p_base_freq: number;
    p_freq_limit: number;
    p_freq_ramp: number;
    p_freq_dramp: number;
    p_vib_strength: number;
    p_vib_speed: number;
    p_arp_mod: number;
    p_arp_speed: number;
    p_duty: number;
    p_duty_ramp: number;
    p_repeat_speed: number;
    p_pha_offset: number;
    p_pha_ramp: number;
    p_lpf_freq: number;
    p_lpf_ramp: number;
    p_lpf_resonance: number;
    p_hpf_freq: number;
    p_hpf_ramp: number;
    sound_vol: number;
    sample_rate: number;
    sample_size: number;
  };

  export type SfxrApi = {
    toBuffer: (definition: SfxrDefinition | string) => number[];
    toWebAudio: (definition: SfxrDefinition | string, audioContext: AudioContext) => AudioBufferSourceNode;
    toWave: (definition: SfxrDefinition | string) => unknown;
    toAudio: (definition: SfxrDefinition | string) => HTMLAudioElement;
    play: (definition: SfxrDefinition | string) => Promise<void>;
    b58decode: (value: string) => SfxrDefinition;
    b58encode: (definition: SfxrDefinition) => string;
    generate: (preset: SfxrPreset, options?: Partial<Pick<SfxrDefinition, "sound_vol" | "sample_rate" | "sample_size">>) => SfxrDefinition;
  };

  export const sfxr: SfxrApi;
}
