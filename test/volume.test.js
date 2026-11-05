import test from "node:test";
import assert from "node:assert/strict";
import { VOLUME_STEPS, VOLUME_MAX, volumeFromPosition, positionFromVolume } from "../src/volume.js";

test("log volume has exact endpoints, monotonic travel and finer low-level control", () => {
    for (const maximum of Object.values(VOLUME_MAX)) {
        assert.equal(volumeFromPosition(0, maximum), 0);
        assert.equal(volumeFromPosition(VOLUME_STEPS, maximum), maximum);
        assert.equal(volumeFromPosition(-1, maximum), 0);
        assert.equal(volumeFromPosition(VOLUME_STEPS + 1, maximum), maximum);
        let previous = 0;
        for (let position = 0; position <= VOLUME_STEPS; position++) {
            const volume = volumeFromPosition(position, maximum);
            assert.ok(volume >= previous && volume <= maximum);
            previous = volume;
        }
        assert.ok(volumeFromPosition(VOLUME_STEPS / 2, maximum) < maximum / 10);
        for (let volume = 0; volume <= maximum; volume++) {
            assert.equal(volumeFromPosition(positionFromVolume(volume, maximum), maximum), volume);
        }
    }
});
