// Test-only subset, subdivision, and full-kit exercises. Not in the app catalog.
export const FIXTURE_LESSONS = {
    "basic-straight": {
        "version": 1,
        "title": "Basic straight groove",
        "bpm": 80,
        "time_signature": [
            4,
            4
        ],
        "bars": 1,
        "tracks": [
            {
                "instrument": "hi_hat_closed",
                "notes": [
                    0,
                    48,
                    96,
                    144,
                    192,
                    240,
                    288,
                    336
                ]
            },
            {
                "instrument": "snare",
                "notes": [
                    96,
                    288
                ]
            },
            {
                "instrument": "kick",
                "notes": [
                    0,
                    192
                ]
            }
        ]
    },
    "mixed-subdivisions": {
        "version": 1,
        "title": "Mixed subdivisions: triplets and thirty-seconds",
        "bpm": 60,
        "time_signature": [
            4,
            4
        ],
        "bars": 2,
        "tracks": [
            {
                "instrument": "ride",
                "notes": [
                    0,
                    96,
                    192,
                    288,
                    384,
                    480,
                    576,
                    672
                ]
            },
            {
                "instrument": "hi_hat_pedal",
                "notes": [
                    96,
                    288,
                    480,
                    672
                ]
            },
            {
                "instrument": "snare",
                "notes": [
                    0,
                    24,
                    48,
                    72,
                    96,
                    128,
                    160,
                    192,
                    208,
                    224,
                    240,
                    256,
                    272,
                    288,
                    300,
                    312,
                    324,
                    336,
                    348,
                    360,
                    372,
                    384,
                    400,
                    416,
                    432,
                    448,
                    464,
                    480,
                    492,
                    504,
                    516,
                    528,
                    540,
                    552,
                    564,
                    576,
                    600,
                    624,
                    648,
                    672,
                    704,
                    736
                ]
            },
            {
                "instrument": "kick",
                "notes": [
                    0,
                    192,
                    384,
                    576
                ]
            }
        ]
    },
    "mps-850-check": {
        "version": 1,
        "title": "MPS-850 pad check",
        "bpm": 80,
        "time_signature": [
            4,
            4
        ],
        "bars": 4,
        "tracks": [
            {
                "instrument": "hi_hat_closed",
                "notes": [
                    0
                ]
            },
            {
                "instrument": "hi_hat_open",
                "notes": [
                    96
                ]
            },
            {
                "instrument": "hi_hat_pedal",
                "notes": [
                    192
                ]
            },
            {
                "instrument": "ride",
                "notes": [
                    288
                ]
            },
            {
                "instrument": "crash_1",
                "notes": [
                    384
                ]
            },
            {
                "instrument": "crash_2",
                "notes": [
                    480
                ]
            },
            {
                "instrument": "snare",
                "notes": [
                    576
                ]
            },
            {
                "instrument": "tom_1",
                "notes": [
                    672
                ]
            },
            {
                "instrument": "tom_2",
                "notes": [
                    768
                ]
            },
            {
                "instrument": "tom_3",
                "notes": [
                    864
                ]
            },
            {
                "instrument": "tom_4",
                "notes": [
                    960
                ]
            },
            {
                "instrument": "kick",
                "notes": [
                    1056
                ]
            }
        ]
    }
};
