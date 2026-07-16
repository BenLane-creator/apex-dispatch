# Apex Dispatch v3 Product Plan

## Product objective

Move delivery-offer analysis from manual estimation to controlled Apex-assisted production without replacing the driver’s final authority.

## Primary workflow

- Input: payout, pickup, drop-off, current position
- Apex output: route miles, traffic delay, ETA, projected time, projected earnings rate, recommendation, alerts, and exact recovery point
- Driver action: accept, decline, navigate, complete, and recover

## Interface principles

- No per-offer mileage or time estimates
- No general recovery corridors
- No unnecessary platform terminology
- Voice-first alerts with readable confirmation
- English and Nicaraguan Spanish parity
- Safety-critical actions remain driver controlled

## Recovery model

Each recovery point includes:

- Exact name
- Full address or GPS coordinates
- Exact legal parking instruction
- Active/inactive status
- Preferred status for near-tied routes

After each drop-off, Apex compares all active points and selects the fastest. A preferred point wins only when its travel time is within three minutes of the fastest point.

## Scoring model

Apex automatically combines:

- Guaranteed payout
- Total operational route mileage
- Traffic-adjusted route duration
- Saved pickup wait history or configured default
- Drop-off service default
- Vehicle cost per mile
- Recovery time
- Current gross-per-mile and gross-per-hour targets

## Future upgrades

- Learn pickup wait averages from completed delivery timestamps
- Route deviation detection and automatic refresh prompts
- Exact recovery-point performance ranking
- Voice confirmation of stop completion
- Optional team synchronization
