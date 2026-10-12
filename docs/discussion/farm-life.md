# Farm life: cattle, a bicycle of his own, building at home

The player's ideas of 12 October 2026, and what we decided for round 1.
How each part works is in `docs/map-work/addons.md` (one section each).

## What the player asked

- "maybe let me ride the cow"
- "when we have a lot of money i think we can buy some cow feed it and sell it"
- "buy some bike also instead of steal from neighbor haha"
- "what if we can also build some place by our self … it might be a bit more work"
- "improve the coconut fruit that fall from tree ui … like drop of water ui"

## Round 1 (decided)

### Riding the white cattle (`roam/_cowRide.ts`)

- The sugar-palm village's three white cattle can be ridden while they graze or
  rest. His own grown cows too.
- It plays like the water buffalo ride, a little quicker, with a trot (Shift).
- The shared list of cows that can be ridden is `src/map/cattle/ride.ts`.

### His own cattle (`roam/_cattle*.ts`, `src/map/cattle/`)

- A cattle trader near the sugar-palm village sells a calf or a young cow,
  sells rice straw, and buys his cows back.
- His cows stand tethered on the meadow north of his house by day. At night
  they sleep in his pen, if he built one.
- Each cow wants food once a map day: straw from his stock, or grass he cuts.
- They grow by map days (calf, young, grown). A cow fed well sells for much
  more than it cost. A cow that is not fed gets thin and sells for less. It
  never dies.

### A bicycle of his own (`roam/_bikeShop*.ts`)

- A bicycle seller at the morning market sells three bicycles.
- His bicycle stays where he leaves it, also between visits.
- The neighbours' bicycles are theirs: no more riding them.
- Angkor Wat's bicycles are for hire, as at the real temple.

### Building at home (`roam/_build*.ts`, `src/map/build/`)

- Near his house, E "Build…" opens a card of nine pieces: a cattle pen, a
  thatched shelter, a bamboo bed, a bamboo fence, a spirit house, a water jar,
  a hammock, a lantern post, a rice-straw stack.
- A ghost shows where it goes (red with a reason where it cannot). He pays,
  then builds it with a hammer, block by block.
- The pieces work: he sits and lies on the bed, lies in the hammock, prays at
  the spirit house, the lamps glow at night, the cows sleep in the pen.
- He can take a piece down for half its price back.
- The pieces, sizes and prices are `src/map/build/pieces.ts`.

### Coconuts (`src/map/garden/_viewFallen.ts`, `_viewDrop.ts`)

- A pixel icon over a tree with fallen fruit to pick up, like the water drop.
- The falling coconut drawn as one round shape, not a pile of blocks.

## Ideas for later

- More pieces: a chicken coop with hens, a well, a fruit stall at home to sell
  his harvest, a bicycle shed, a little bridge over the stream.
- A house upgrade: a second room, a tin roof, a kitchen hut.
- Cattle: a calf born to two grown cows, the herd boy minding his cows for a
  small fee, taking them to graze with the village's herd.
- Bicycles: a basket that carries his harvest, a bell he picks, a puncture
  fixed at the seller.
