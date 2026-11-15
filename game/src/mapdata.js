// Emberline's map: a dusk freight yard, 44 x 38 m, drawn once as data and built twice —
// once as three.js meshes by world.js, once as Box3 colliders by the same pass. The yard
// has three lanes (A-long west, Mid centre, B-long east), two bomb sites (A warehouse
// north-west, B fuel depot north-east), and a waypoint graph the bots walk. Attackers
// (Vanguard) spawn south; defenders (Sentinel) spawn north.
//
// Coordinates: x east (+), z south (+). y is up; every box lists its centre y.
export const MAP = {
  bounds: { x: 22, z: 19 },
  sites: {
    A: { x: -16.5, z: -13.5, label: 'A' },
    B: { x: 16.5, z: -13.5, label: 'B' },
  },
  spawns: {
    vanguard: [
      [-6, 16.5], [-2, 16.5], [2, 16.5], [6, 16.5],
    ],
    sentinel: [
      [-6, -16.5], [-2, -16.5], [2, -16.5], [6, -16.5],
    ],
  },
  // Boxes: [width, height, depth, x, y, z, material]. y is the centre height.
  boxes: [
    // Floor and perimeter.
    [44.4, 0.4, 38.4, 0, -0.2, 0, 'ground'],
    [0.4, 5.0, 38.4, -22.2, 2.5, 0, 'concrete'],
    [0.4, 5.0, 38.4, 22.2, 2.5, 0, 'concrete'],
    [44.4, 5.0, 0.4, 0, 2.5, -19.2, 'concrete'],
    [44.4, 5.0, 0.4, 0, 2.5, 19.2, 'concrete'],
    // Site A warehouse shell: two walls and a roof beam, open to the yard.
    [10.0, 4.2, 0.4, -16.5, 2.1, -17.4, 'concreteDark'],
    [0.4, 4.2, 6.0, -21.4, 2.1, -14.6, 'concreteDark'],
    [10.0, 0.5, 6.4, -16.5, 4.4, -14.6, 'metal'],
    [1.0, 2.6, 1.0, -12.2, 1.3, -17.2, 'rust'],
    // Site B fuel depot: two tanks and a low wall.
    [2.6, 2.6, 2.6, 14.6, 1.3, -16.2, 'rust'],
    [2.6, 2.6, 2.6, 18.8, 1.3, -16.2, 'metal'],
    [8.0, 1.0, 0.6, 16.5, 0.5, -11.2, 'concrete'],
    // A-long: container stacks west.
    [6.0, 2.6, 2.6, -18.0, 1.3, -6.0, 'rust'],
    [6.0, 2.6, 2.6, -18.0, 1.3, 2.0, 'metal'],
    [2.6, 2.6, 6.0, -14.0, 1.3, 6.0, 'concreteDark'],
    [2.6, 2.6, 2.6, -18.0, 1.3, 10.0, 'rust'],
    // B-long: container stacks east.
    [6.0, 2.6, 2.6, 18.0, 1.3, -6.0, 'metal'],
    [6.0, 2.6, 2.6, 18.0, 1.3, 2.0, 'rust'],
    [2.6, 2.6, 6.0, 14.0, 1.3, 6.0, 'concreteDark'],
    [2.6, 2.6, 2.6, 18.0, 1.3, 10.0, 'metal'],
    // Mid: crate field and the watch platform.
    [1.2, 1.2, 1.2, -3.0, 0.6, -2.0, 'rust'],
    [1.2, 1.2, 1.2, -1.6, 0.6, -2.2, 'metal'],
    [1.2, 1.2, 1.2, -2.3, 1.8, -2.1, 'concreteDark'],
    [1.2, 1.2, 1.2, 3.0, 0.6, -2.0, 'metal'],
    [1.2, 1.2, 1.2, 4.4, 0.6, -1.8, 'rust'],
    [3.6, 1.1, 1.2, 0, 0.55, 3.0, 'concrete'],
    [1.2, 1.1, 3.6, -8.0, 0.55, 3.0, 'concrete'],
    [1.2, 1.1, 3.6, 8.0, 0.55, 3.0, 'concrete'],
    [4.0, 0.9, 4.0, 0, 0.45, -8.0, 'metal'],
    [1.2, 0.45, 1.2, 2.6, 0.225, -8.0, 'rust'],
    // Mid-cross pillars and spawn cover.
    [1.0, 3.4, 1.0, -10.0, 1.7, -4.0, 'concreteDark'],
    [1.0, 3.4, 1.0, 10.0, 1.7, -4.0, 'concreteDark'],
    [1.0, 3.4, 1.0, -10.0, 1.7, 8.0, 'concreteDark'],
    [1.0, 3.4, 1.0, 10.0, 1.7, 8.0, 'concreteDark'],
    [2.4, 1.0, 1.2, -4.0, 0.5, 13.0, 'rust'],
    [2.4, 1.0, 1.2, 4.0, 0.5, 13.0, 'metal'],
    [2.4, 1.0, 1.2, -4.0, 0.5, -13.5, 'metal'],
    [2.4, 1.0, 1.2, 4.0, 0.5, -13.5, 'rust'],
    // Site approach cover.
    [1.2, 1.2, 1.2, -12.0, 0.6, -10.0, 'rust'],
    [1.2, 1.2, 1.2, 12.0, 0.6, -10.0, 'metal'],
    [3.0, 1.1, 1.2, -8.0, 0.55, -13.0, 'concrete'],
    [3.0, 1.1, 1.2, 8.0, 0.55, -13.0, 'concrete'],
  ],
  // Waypoints the bots walk: id, x, z, and the ids it connects to.
  waypoints: [
    { id: 0, x: -6, z: 16, to: [1, 4, 5] },
    { id: 1, x: 0, z: 16, to: [0, 2, 6] },
    { id: 2, x: 6, z: 16, to: [1, 3, 7] },
    { id: 3, x: 14, z: 14, to: [2, 7, 10] },
    { id: 4, x: -14, z: 14, to: [0, 5, 8] },
    { id: 5, x: -10, z: 8, to: [4, 6, 8] },
    { id: 6, x: 0, z: 8, to: [1, 5, 7, 9] },
    { id: 7, x: 10, z: 8, to: [2, 3, 6, 10] },
    { id: 8, x: -15, z: 2, to: [4, 5, 11] },
    { id: 9, x: 0, z: 0, to: [6, 11, 12, 13] },
    { id: 10, x: 15, z: 2, to: [3, 7, 12] },
    { id: 11, x: -12, z: -6, to: [8, 9, 14] },
    { id: 12, x: 12, z: -6, to: [9, 10, 15] },
    { id: 13, x: 0, z: -6, to: [9, 14, 15] },
    { id: 14, x: -16, z: -11, to: [11, 13, 16] },
    { id: 15, x: 16, z: -11, to: [12, 13, 17] },
    { id: 16, x: -16, z: -14, to: [14] },
    { id: 17, x: 16, z: -14, to: [15] },
    { id: 18, x: -6, z: -16, to: [14, 19] },
    { id: 19, x: 0, z: -16, to: [18, 20, 13] },
    { id: 20, x: 6, z: -16, to: [19, 15] },
  ],
  // Waypoint ids near each site, for holds and plant spots.
  siteNodes: { A: [14, 16], B: [15, 17] },
  // Defender hold nodes: pairs of [waypoint, facing yaw].
  holds: {
    A: [[14, 0.6], [11, 0.4], [13, -0.5]],
    B: [[15, -0.6], [12, -0.4], [13, 0.5]],
    mid: [[9, 0], [6, 0]],
  },
};
