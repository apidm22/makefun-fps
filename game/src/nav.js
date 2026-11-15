// Waypoint navigation: the map's graph as an adjacency list, with a breadth-first
// search that returns the node ids from start to goal. Bots replan when their goal
// changes; the graph is small enough that BFS is cheaper than caching paths.
import { MAP } from './mapdata.js';

const nodes = new Map();
for (const point of MAP.waypoints) nodes.set(point.id, point);

export function nearestNode(x, z) {
  let best = null;
  let bestDistance = Infinity;
  for (const point of MAP.waypoints) {
    const dx = point.x - x;
    const dz = point.z - z;
    const distance = dx * dx + dz * dz;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point.id;
    }
  }
  return best;
}

export function findPath(fromId, toId) {
  if (fromId === toId) return [fromId];
  const previous = new Map();
  const queue = [fromId];
  previous.set(fromId, null);
  while (queue.length > 0) {
    const current = queue.shift();
    const node = nodes.get(current);
    if (!node) continue;
    for (const next of node.to) {
      if (previous.has(next)) continue;
      previous.set(next, current);
      if (next === toId) {
        const path = [toId];
        let step = current;
        while (step !== null) {
          path.unshift(step);
          step = previous.get(step);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [fromId];
}

export function nodePosition(id) {
  const node = nodes.get(id);
  return node ? { x: node.x, z: node.z } : { x: 0, z: 0 };
}

export function nodeCount() {
  return nodes.size;
}
