export const VOLUME_STEPS = 3000;
export const VOLUME_MAX = { guide: 100, metronome: 300 };

/** Exponential gain travel, with exact silence at the left endpoint. */
export function volumeFromPosition(position, maximum) {
    const fraction = Math.max(0, Math.min(VOLUME_STEPS, position)) / VOLUME_STEPS;
    return Math.round(maximum * Math.expm1(Math.log(101) * fraction) / 100);
}

export function positionFromVolume(volume, maximum) {
    const fraction = Math.max(0, Math.min(maximum, volume)) / maximum;
    return Math.round(VOLUME_STEPS * Math.log1p(100 * fraction) / Math.log(101));
}
