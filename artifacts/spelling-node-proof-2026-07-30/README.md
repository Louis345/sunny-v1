# Sunny spelling-node runtime proof

Runtime: `demo-pashley`, homework preview, persistence blocked, voice muted.

`contact-sheet.png` collects every node proof in one image. The individual screenshots below preserve the full-size evidence.

| Board item | Proof | Result |
| --- | --- | --- |
| Full board | `00-board.png` | All nodes visible with collision-free positions and Grok artwork |
| Start | `12-start-completed.png` | Completed entry state visible |
| Silent Letters Word Radar | `01-silent-letters-word-radar.png` | Activity intro renders with Ready and Back controls |
| Silent Letters Spell Check | `02-silent-letters-spell-check.png` | Interactive guided spelling frame renders |
| High Frequency Words Word Radar | `03-high-frequency-word-radar.png` | Activity intro renders with Ready and Back controls |
| High Frequency Words Pronunciation | `04-high-frequency-pronunciation.png` | Word, timer, transcript status, and Back control render; audio was not exercised in muted preview |
| Silent Letters Monster Stampede | `05-monster-stampede.png` | Game intro renders with Fight control |
| Silent Letters Letter Rush | `06-letter-rush.png` | Correct Letter Rush game renders after board-overlap fix |
| Silent Letters Word Radar 2 | `07-silent-letters-word-radar-2.png` | Correct second radar activity renders |
| Mystery | `08-mystery-choice.png` | Three mystery choices render |
| Quest | `09-quest-locked.png` | Preparing/locked state renders |
| Boss | `10-boss-locked.png` | After-Quest locked state renders |
| Choose Path | `11-choose-path.png` | Route-choice modal renders three available choices |

No lesson was completed and preview actions did not write child progress. Browser inspection reported no application errors; only existing Three.js FBX compatibility warnings.

The original Letter Rush misroute is retained under `diagnostics/` as evidence for the human-caught overlapping-node invariant.
