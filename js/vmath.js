// Length of a 2D or 3D vector. Use this instead of Math.hypot in anything that runs every tick or frame:
// Math.hypot is several times slower in Chromium and allocates on every call, which adds up to megabytes of
// garbage a second (and the collector's pauses) with ten players in a match.
export const hyp = (x, y, z = 0) => Math.sqrt(x * x + y * y + z * z);
