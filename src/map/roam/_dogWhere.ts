/**
 * Where his dog is, for the maps (ui/_minimapSpots.ts `my-dog`: the "My dog" badge), with no three.js: the dog
 * add-on (roam/_dog.ts) writes it each frame, the maps read it. Shown only while the dog is somewhere without him:
 * told to stay, at home on its bed (sent home, or he is asleep in his house), waiting while he is in the boat or in
 * the air, sitting at a hall's door (AWP-36: a dog sent home was nowhere to be found). Following him, coming to him,
 * or not his yet: no badge.
 */
export const DOG_WHERE = {
  shown: false,
  x: 0,
  z: 0,
  /** Goes up whenever the badge should move or show / hide (the big map moves its button then). */
  n: 0,
};

/** The badge moves once the dog is this far from where it was last put (m). */
const MOVE = 0.5;

export function dogWhere(shown: boolean, x: number, z: number): void {
  if (shown === DOG_WHERE.shown && (!shown || Math.hypot(x - DOG_WHERE.x, z - DOG_WHERE.z) < MOVE)) return;
  DOG_WHERE.shown = shown;
  DOG_WHERE.x = x;
  DOG_WHERE.z = z;
  DOG_WHERE.n++;
}
