<!-- study-swarm · ai-rpg-engine felt-world · 2026-09-20 -->
# Study-swarm dispatch: making the world felt (ai-rpg-engine)

> **Product.** AI RPG Engine v3.11 is a deterministic turn-based simulation. v3.10 already ships a presentation plan (`NarrationPlan`, `AudioCommand[]`, tone-aware zone music, victory/retreat stings, `SpeakerCue` + disjoint `asides[]`). Nothing plays a sound. The terminal is the shipped player; `ai-rpg-stage` (Godot 4) is built, not filled. Philosophy: the sim is objective truth; presentation may lie.
>
> **This dispatch grounds the next layer** — a felt consumer — before any plan is locked. Five parallel research agents (Step 2) wrote retrieval-backed packets under `docs/study-swarm/felt-world/`. Findings below are the synthesizer's floor: only retrieved sources, softened to what an abstract/canonical page actually supports. **Step 5 is not load-bearing until Step 4 returns a non-blocking verdict.**

## Step 1 — Load-bearing questions

Each has two real designs that hinge on the answer:

- **Q1 Discrete-tick presence.** Per-event juice vs one composed beat per turn vs key-moment packages only?
- **Q2 Adaptive music vs the turn clock.** Execute `AudioCommand`s as one-shots (A), Motif-style vertical reorchestration in-engine (B), or cue-ids to a client mixer (C)?
- **Q3 TTS as a second channel.** TTS-full (log + line + asides) vs dialogue-only (`SpeakerCue.text`) vs skip this cycle?
- **Q4 Presentation lie budget.** Sterile stage (draw only hashed facts) vs an explicit client juice budget that must not become a second sim?
- **Q5 First felt surface.** Terminal audio backend vs Godot stage vs thin web embedder?

## Step 2 — Research dispatch

Five general-purpose agents, one question each, parallel, retrieval-required (web_search + web_fetch / Crossref / arXiv). Word-capped 500–600. No lane returned a stub. Packets:

- `docs/study-swarm/felt-world/q1-discrete-tick-presence.md`
- `docs/study-swarm/felt-world/q2-adaptive-music.md`
- `docs/study-swarm/felt-world/q3-tts-second-channel.md`
- `docs/study-swarm/felt-world/q4-presentation-lie-budget.md`
- `docs/study-swarm/felt-world/q5-first-felt-surface.md`

## Step 3 — Research grounding

1. **None and Extreme juiciness both cut play time, experience, motivation, and in-game performance versus Medium/High.** Kao 2020 (DOI 10.1016/j.entcom.2020.100359). Implication: fanfare-every-kill is Extreme; budget Medium/High juice at the turn, not every sim event.
2. **Amplifying feedback on every action occludes action–outcome binding (effectance/competence drop); success-dependent juice raises motives.** Kao, Ballou, Gerling, Breitsohl & Deterding 2024 (DOI 10.1145/3613904.3642656). Implication: grade juice by outcome (hit vs crit vs `encounter.cleared`), not by event count.
3. **Game-feel polishing takes the shape of tuning, juicing, and streamlining; juicing is amplification that empowers and communicates the importance of game events.** Pichlmair & Johansen 2020 (arXiv:2011.09201). Implication: juice is for importance, so one composed AudioDirector beat per tick — not a cue per emitted event.
4. **Developers locate “world felt” in ambient state available without input, and demand that feedback reflect event importance.** Hicks, Dickinson, Holopainen & Gerling 2018 (DOI 10.26503/dl.v2018i1.936). Implication: `AmbientCue[]` is idle presence; SFX/UI exaggeration only on state change.
5. **Visual embellishments raise aesthetic appeal in every tested game, but competence, curiosity, and presence only in some.** Hicks, Gerling, Dickinson & Vanden Abeele 2019 (DOI 10.1145/3311350.3347171). Implication: flash/shake/particles are appeal, not a presence strategy.
6. **Workload drops at large subtask boundaries; interrupting there is cheap, mid-task interrupts are expensive.** Bailey & Iqbal 2008 (DOI 10.1145/1314683.1314689). Implication: fire the composed beat at the tick/turn boundary, not mid-resolution.
7. **Under high visual load, operators miss a critical auditory alert they detect when unoccupied (about two in five in the cockpit study).** Dehais, Causse, Vachon, Régis, Menant & Tremblay 2014 (DOI 10.1177/0018720813510735). Implication: dense SFX during combat resolution will not be heard; reserve high-salience audio for post-resolution key moments.
8. **Operators probability-match response rate to alarm reliability (cry-wolf); frequent unreliable cues are ignored.** Bliss, Gilson & Deaton 1995 (DOI 10.1080/00140139508925269). Implication: nine listeners fanfaring every kill trains ignore.
9. **A stinger is an overlay mixed over currently playing music, waitable to the next bar/cue — not a replacement stem.** Audiokinetic 2025 (*Using Stingers*, https://www.audiokinetic.com/library/2025.1.7_9143/?source=Help&id=using_stingers). Implication: `combat.victory`/`defeat`/`retreat` overlay the zone stem; sting-must-not-kill-stem is middleware default.
10. **Adaptive change itself inflates reported tension, even when the mapping is inverted.** Plut & Pasquier 2019 (DOI 10.1109/CIG.2019.8847951). Implication: no sting or layer bump on every tick; reserve overlays for rare named beats.
11. **Music moves enjoyment via emotion; spatial-presence and identification mediations failed.** Klimmt, Possler, May, Stegeren, Landmann & Wolf 2018 (DOI 10.1080/15213269.2018.1507827). Implication: a grim district wants a congruent held stem, not a busier mixer, and music is not the presence lever.
12. **Interactive XMF’s contract is Cue / Chunk / Transition: the host names a cue; the player owns musical time and mix of parallel tracks.** IASIG/MMA 2008 (*Interactive XMF* draft 0.9.1, https://igda-website.s3.us-east-2.amazonaws.com/wp-content/uploads/2023/09/18181417/ixmf_draft-v091.pdf). Implication: emit cue ids; Motif/vertical layering stays in the client pack, not the turn engine.
13. **Concurrent on-screen text that duplicates or summarizes narration, plus seductive spoken details, hurts retention and transfer.** Mayer, Heiser & Lonn 2001 (DOI 10.1037/0022-0663.93.1.187). Implication: TTS-full (log + line + asides, spoken while the terminal still prints) is this hurt condition.
14. **Spoken-plus-printed words help only when there is no concurrent visual stream.** Moreno & Mayer 2002 (DOI 10.1037/0022-0663.94.1.156). Implication: this RPG already has concurrent visuals; dual-coding is not a license to speak every printed fragment.
15. **Across 57 studies, spoken-written did not beat written-only overall; any dual advantage over speech-only was limited to low prior knowledge, system-paced, picture-free materials.** Adesope & Nesbit 2012 (DOI 10.1037/a0026147). Implication: a self-paced printed log gets little comprehension gain from being spoken.
16. **Long spoken streams reverse the modality benefit because speech is transient; shortening the audio reinstates it.** Leahy & Sweller 2011 (DOI 10.1002/acp.1787). Implication: keep the spoken channel short — `SpeakerCue.text` only.
17. **People attribute personality to synthetic speech and prefer voice–content consistency.** Nass & Lee 2001 (DOI 10.1037/1076-898X.7.3.171). Implication: ship dialogue-only with `SpeakerCue.emotion` as manner; unstable identity is an immersion break, not a nice-to-have.
18. **Dialogue must be mixable independently of music/SFX, and game audio must duck when a screen reader speaks.** Microsoft 2024 (Xbox Accessibility Guideline 105, https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/105). Implication: a mute/dialogue slider and screen-reader isolation are admission gates, not polish.
19. **GGPO treats audio, video, and non-impacting SFX as non-state, requires stepping the sim without rendering, and shows a two-frame flash fired inside a rollback is consumed so the remote player never sees it.** Cannon 2019 (*GGPO Developer Guide*, https://github.com/pond3r/ggpo/blob/master/doc/DeveloperGuide.md). Implication: juice lives after commit, on presentation-owned layers; hashed state is inputs plus serializable sim.
20. **Snapshot interpolation reconstructs a visual approximation from received snapshots; extrapolating colliding rigid bodies fails because the interpolator does not know contacts.** Fiedler 2014 (*Snapshot Interpolation*, https://gafferongames.com/post/snapshot_interpolation/). Implication: lerp between two sim-emitted poses is a lie budget; inventing the next pose is a second sim.
21. **WCAG 2.3.1 forbids more than three flashes per second; camera shake, bob, and flash must be independently disableable.** Kirkpatrick, O Connor, Campbell & Cooper 2018 (W3C Understanding SC 2.3.1, https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold.html); Microsoft 2024 (Xbox Accessibility Guideline 117, https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/117). Implication: the lie budget must be user-killable without changing the hash.
22. **Place illusion is constrained by the sensorimotor contingencies the system affords; plausibility illusion by events that directly relate to the participant.** Slater 2009 (DOI 10.1098/rstb.2009.0138). Implication: Godot can host both; a CLI beep is feedback, not being-there.
23. **Immersion’s medium presence effect is driven by tracking, stereo, and field of view — not by upgrading auditory content.** Cummings & Bailenson 2016 (DOI 10.1080/15213269.2015.1015740). Implication: terminal stings and a thin web embedder both miss the levers that actually move presence.
24. **Diegetic SFX in a visual game raise subjective immersion; music often does not move tonic physiology.** Nacke, Grimshaw & Lindley 2010 (DOI 10.1016/j.intcom.2010.04.005). Implication: SFX as confirmation *inside* a visual action loop (Godot), not a TUI overlay.
25. **Unmuted web autoplay requires a user gesture; AudioContext starts suspended.** Beaufort 2018, Chrome autoplay (https://developer.chrome.com/blog/autoplay). Implication: a thin web embedder fails the first-hour audio test.
26. **WCAG Level A requires captions for prerecorded audio, not audio for text.** Kirkpatrick, O Connor, Campbell & Cooper 2018 (W3C Understanding SC 1.2.2, https://www.w3.org/WAI/WCAG21/Understanding/captions-prerecorded.html). Implication: the terminal log is already the caption channel; adding beeps is optional enhancement, not the presence path.

## Step 4 — External verification

`roleos verify-citations` → `prism verify --type citations` (provider ollama, `PRISM_DEV=1`). Synthesizer = this Grok session; verifier = prism + ollama. Receipt `docs/study-swarm/felt-world.citation-receipt.json`.

**Pass 1** (prism `prism-01m30czjch3xgtb0r2gdaywtt5`): 0 fabricated, 18/18 arXiv/DOI existence resolved, verdict `revise`. One contradicted number (Dehais). Two over-claimed abstracts (Pichlmair, Slater). Those three findings were rewritten.

**Pass 2** (same runner, after the correct-once): **0 fabricated, 0 contradicted**, 18/18 existence resolved, **5 supported**, 13 Crossref-rows-without-abstracts, verdict `escalate` (advisory, not blocking). The Dehais/Pichlmair/Slater corrections took.

**Out-of-band abstracts (Semantic Scholar, not the Crossref lens):** Kao 2020 (None and Extreme both worse than Medium/High, N=3018) and Kao 2024 (amplification reduced motives; success-dependence enhanced them, n=1699, pre-registered). Those two are treated as existence + SS-abstract grounded, and named here so the gap is visible.

**Contrastive (CANNOT_CONFIRM for Step 5):** you might have expected Mayer 2001, Moreno 2002, Adesope 2012, Nass 2001, Cummings 2016, Nacke 2010, Hicks 2018/2019, Bliss 1995, Plut 2019, Klimmt 2018 to lock architecture. Crossref served no abstract to the groundedness lens, so they stay **existence-only** — they do not carry a Step-5 choice by themselves.

**Spec/vendor URLs (no arXiv/DOI; not fabrication):** Wwise stingers, iXMF, XAG 105/117, GGPO guide, Fiedler snapshot interpolation, WCAG 2.3.1, WCAG 1.2.2, Chrome autoplay — retrieved against the cited URL out of band.

## Step 5 — Architecture (load-bearing only where Step 4 supported or named an out-of-band abstract)

Each choice traces to findings by number. Existence-only findings are not used as the sole warrant.

- **C1 — First felt surface is Godot stage, one playable scene.** Place illusion needs sensorimotor contingencies; plausibility needs events that relate to the player (22, supported). Terminal `run` stays onboarding and the caption/log channel (26, URL-verified). Web embedder is not this cycle (25, URL-verified). Filling all three is forbidden. Cummings 2016 and Nacke 2010 are existence-only and do **not** carry this choice.
- **C2 — Per-turn composed beat + continuous ambient + key-moment allow-list.** Juicing communicates event importance (3, supported). Fire the composed beat at the tick boundary (6, supported). High-salience audio after resolution, not mid-combat (7, supported). Kao 2020/2024 (1, 2; SS abstracts) bound the juice at Medium/High and success-graded, not Extreme/every-event. Forbid per-event fanfare.
- **C3 — Cue-id contract; stings overlay; vertical remix is client state.** Host emits cue ids (12, URL-verified iXMF). Victory/defeat/retreat overlay the zone stem (9, URL-verified Wwise). Motif stays a client pack. Plut 2019 and Klimmt 2018 are existence-only and do **not** carry a “never adapt” rule — the supported constraint is importance-gated juice (3) plus overlay-not-replace (9).
- **C4 — Dialogue-only TTS this cycle.** Keep the spoken channel short (16, supported). Speak `SpeakerCue.text` with emotion/speed; `asides[]` stay visual; terminal still prints. Admission: independent dialogue slider + screen-reader duck (18, URL-verified XAG 105). Forbid TTS-full. Mayer/Moreno/Adesope/Nass are existence-only and do **not** carry this choice alone.
- **C5 — Explicit client lie budget, never a second sim.** Juice lives after commit on presentation-owned layers (19, URL-verified GGPO). Lerp last two hashed poses; do not invent the next one (20, URL-verified Fiedler). Allowed: camera trauma, particles, panned audio from hashed emitter ids, HUD flash/shake/fade. Forbidden: juice that writes hashed entity/zone state; spatial audio inventing a position the sim did not send; shake that offsets the bound node; picker/intent rays that trust the drawn pose. Independently disableable without changing the hash (21, URL-verified WCAG 2.3.1 / XAG 117). Hash mismatch still annunciates staleness.
- **C6 — Deterministic floor unchanged.** Engine still emits the plan; clients still must not decide. “Presentation may lie” is now the C5 budget, not a slogan.

**Net:** stop deepening the sim. Fill Godot so a human hears the existing contract (cue ids, overlay stings, spoken line, ambient) inside a visual action loop, with juice that cannot desync the hash.
