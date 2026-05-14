# Activity Capability Audit

`src/engine/activityToolCatalog.ts` is the machine-readable source of truth for activity capability cards. This document is the human-readable snapshot. If this document and the code disagree, fix the code first and regenerate this summary from the catalog.

The product rule is clinical: baseline and first-class activities are instruments. They must state what they measure, how they are configured, what signals they emit, and what they cannot prove. Generated quests, bosses, and visual lessons should be built from this evidence instead of replacing it.

## Baseline And Learning Activities

| Activity | Config Source | What It Measures | Real Difficulty / Modes | Key Signals | What It Cannot Prove |
| --- | --- | --- | --- | --- | --- |
| Concept Check | `activity-config-file` | Concept understanding, reading/science comprehension, misconceptions before teaching. | Warmup check, baseline probe, transfer check. | Question result, selected answer, response time, completion accuracy. | Reading fluency, spelling, or broad mastery when choices reveal the answer. |
| Visual Explainer | `generated-artifact` | Engagement with a concept model and whether direct teaching is needed. | Guided model, interactive pause, playthrough review. | Artifact opened, interaction answer, completion, validation result. | Independent transfer without a follow-up check. |
| Picture Question | `activity-config-file` | Applied comprehension with visual anchors and vocabulary meaning. | Recognition choice, near-miss choice, explain choice. | Choice result, response time, explanation attempt. | Cold reading/spelling evidence when the image gives away the answer. |
| Spelling Recall | `canvas-message` | Cold spelling production and per-word baseline. | Audio word, sentence context, definition prompt. | Attempt text, per-word result, retry count. | Flow or engagement by itself. |
| Word Radar | `canvas-message` | Visible-word recognition, read-aloud flow, recall practice only when the answer is hidden. | `visible_read`, `partial_visual_recall`, `hidden_word_recall`. | Captured response, hit/miss, timer pressure, retry/skip. | Mastery when the word is visible or speech is not captured. |
| Spell Check | `query-params` | Spelling construction from hidden/audio/context prompt and letter order. | `guided_letter_build`, `audio_prompt_spell`, `cold_recall_spell`. | Per-target result, attempt text, retry count, completion accuracy. | Independent mastery when visible answers, retries, or hints happen first. |
| Word Builder | `query-params` | Scaffolded word construction, chunk awareness, correction after errors. | Fill blanks, scrambled tiles, chunk builder. | Tile placement, correctness, retry count, completion. | Cold spelling mastery while tiles/blanks reveal structure. |
| Letter Rush | `activity-config-file` | Falling-word spelling, visual discrimination, hidden recall only in mastery-run mode. | `read_and_race`, `trap_the_imposter`, `mastery_run`. | Spawned item, hit/miss, distractor selected, per-target result. | Mastery when the target word or letter bank is visible. |
| Speed Catcher | `query-params` | Falling-word recognition and correctly spelled word selection among fakes. | Slow catch, near-miss catch, streak catch. | Caught word, missed word, distractor hit, score. | Written spelling production or comprehension. |
| Monster Stampede | `query-params` | Fast orthographic recognition, spelling under pressure, recovery, competition/streak engagement. | `visible_stampede`, `targeted_recovery_run`, `pressure_probe`. | Hit/miss, streaks, recovery after miss, score. | Clean first-pass baseline or paper transfer. |
| Pronunciation | `canvas-message` | Reading/pronunciation fluency, decoding struggle, hesitation, help, recovery, flow tolerance. | `supported_read_aloud`, `flow_replay_expansion`, `diagnostic_reading_probe`. | Word start, hit/miss, support cue, replay selection, completion accuracy. | Written spelling mastery or comprehension beyond decoding. |
| Story Karaoke | `canvas-message` | Story reading fluency, skipped words, stamina, target vocabulary in context. | `guided_story_read`, `target_word_reread`, `cold_passage_probe`. | `reading_progress`, word index, skipped/flagged word, completion accuracy. | Spelling mastery or comprehension without follow-up questions. |
| Wordle | `query-params` | Letter-position inference, spelling strategy, persistence after feedback. | Guided wordle, target wordle, transfer wordle. | Guess path, letter feedback, solve success, guess count. | Full-list cold spelling mastery when hints/filters are present. |
| b/d Reversal | `registry-default` | b/d visual discrimination and reversal risk. | Mnemonic practice, word probe, speed probe. | Probe result, selected letter, response time, accuracy. | General reading or spelling mastery. |
| Clock Game | `query-params` | Analog clock reading and time vocabulary. | Hour only, half/quarter, mixed minutes. | Time prompt, answer, correctness, accuracy. | Broader math transfer unless varied prompts support it. |
| Coin Counter | `query-params` | Coin identification, skip-counting, value composition. | Identify coins, count same coin, mixed amounts. | Selected coin, target amount, correctness, accuracy. | Written arithmetic transfer while values are shown. |

## Attention And Reward Instruments

| Activity | Config Source | Purpose | Key Signals | Guardrail |
| --- | --- | --- | --- | --- |
| Bubble Pop | `query-params` | Low-stakes attention/readiness check or tiny reset. | Hit/miss, response time, score, completion. | Not curriculum evidence. |
| Quiet Focus | `query-params` | Sustained-attention vitals with low reward density. | Hit, false alarm, miss, reaction time. | Trend across sessions; never diagnose from one run. |
| Fish Flanker | `query-params` | Selective attention and interference control. | Trial result, reaction time, congruency, accuracy. | Avoid right after frustration. |
| Target Blaster | `query-params` | Visual search and response timing. | Target hit, distractor hit, reaction time, score. | Do not attach academic claims unless targets are academic and configured. |
| Hero Shield | `query-params` | Inhibition, protection timing, recovery after mistakes. | Block, miss, wrong block, wave completion. | Reward/vitals only unless an academic target contract exists. |
| Wheel of Fortune | `query-params` | Pattern inference, letter strategy, choice/surprise engagement. | Letter guesses, board state, solve result, coins. | Excellent reward/preference signal; not mastery by itself. |
| Mystery | `reward-game` | Choice, preference, reward recovery, transition tolerance. | Options shown, child choice, selected game, completion. | Preference never overrides assignment/domain validity. |
| Store | `registry-default` | Companion-care motivation and earned choices. | Item viewed/bought, currency update, care event. | Relationship/reward surface, not academic evidence. |
| Asteroid | `reward-game` | Short action reward and space/action preference. | Score, duration, completion, payout. | Bounded reward/reset only. |
| Space Frogger | `reward-game` | Navigation reward and movement-style preference. | Score, duration, completion, payout. | Bounded mystery option after evidence work. |
| Space Invaders | `reward-game` | Fast action reward and competition preference. | Score, duration, completion, payout. | Do not treat score as learning evidence. |
| Vault Cracker | `query-params` | Puzzle/reward wrapper around known targets. | Guess, hint used, success/failure, attempt count. | Not first baseline; puzzle mechanics must not swallow the academic target. |

## Generated Destinations

| Activity | Config Source | Role | Unlock Rule |
| --- | --- | --- | --- |
| Quest | `generated-artifact` | Generated transfer test tied to a chart theory. | Locked until captured homework, baseline evidence, cataloging, and validation gates pass. |
| Boss | `generated-artifact` | Mastery-gated finale after quest evidence. | Locked until quest evidence supports a harder transfer check. |

## Storybook Need

The next product-hardening step is a Storybook-style baseline lab: each first-class activity should have a deterministic demo story, fixture configs for each mode, and visual regression coverage. That lab should start with Word Radar, Pronunciation, Story Karaoke, Letter Rush, Spell Check, and Monster Stampede because those are the current "blood pressure machines" for spelling, reading, fluency, and engagement.
