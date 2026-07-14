# Apex Dispatch Product and Build Plan

## 1. Product objective

Apex Dispatch is a driver-controlled decision-support system for the JF + BL Saturday delivery operation. Its purpose is to improve offer selection, reduce unproductive mileage, preserve peak-period availability, and create a repeatable dataset for continuous optimization.

The initial product does **not** attempt to control DoorDash or obtain account credentials. It operates beside the official Dasher app.

## 2. Primary users

### JF — Driver and account holder

- Controls the official delivery app.
- Makes the final accept/decline decision.
- Drives, verifies pickups, completes handoffs, and handles customer communication.
- Reports field conditions to BL.

### BL — Dispatcher and field assistant

- Enters offer data.
- Reviews the generated recommendation.
- Determines the recovery/staging point.
- Tracks restaurant delays, destination quality, mileage, and shift KPIs.
- Assists with carrying and shopping work when applicable.

## 3. V1 workflow

1. DoorDash displays an offer to JF.
2. BL enters payout, displayed mileage, probable return mileage, merchant, zone, time estimate, and complexity.
3. The scoring engine estimates:
   - Operational miles
   - Vehicle cost
   - Gross and net dollars per mile
   - Gross and net hourly rate
   - Restaurant/zone risk
   - Overall score
4. The app returns ACCEPT, MAYBE, or DECLINE plus separate instructions for BL and JF.
5. JF verifies the official offer and makes the final decision.
6. BL logs the offer and records actual results after completion.
7. Post-shift metrics are exported or reviewed in the app.

## 4. V1 scoring model

The current model combines:

- Zone-specific gross dollars-per-mile threshold
- Projected gross hourly rate
- Minimum payout
- Expected completion time
- Vehicle operating-cost allowance
- Restaurant grade and known wait time
- Return/deadhead mileage
- Apartment/hotel/hospital access complexity
- Heavy items and multiple stops
- Peak-period opportunity cost
- End-of-shift positioning benefit

Default settings are editable and should be calibrated with actual Saturday results.

## 5. V1 data model

### Offer record

- Platform and offer type
- Guaranteed payout
- Displayed and return mileage
- Merchant
- Destination zone
- Estimated wait and delivery time
- Stops, item count, access and heavy-item flags
- Calculated score and recommendation

### Completed delivery record

- Timestamp
- Actual payout
- Actual operational mileage
- Actual completion time
- Merchant
- Estimated net after vehicle allowance

### Restaurant intelligence

- Merchant name
- Grade A–D
- Typical wait
- Operational notes

### Shift record

- Shift start/end
- Break time
- Completed deliveries
- Gross revenue
- Operational mileage
- Vehicle-cost allowance
- Estimated net before tax
- Gross active-hour rate

## 6. Privacy and compliance boundary

- No DoorDash username or password.
- No automated login.
- No automated accept/decline action.
- No simulated taps or background control of the Dasher app.
- No interception of private network traffic.
- All V1 records remain in the browser unless exported by the user.

## 7. Product roadmap

### V1.1 — Screenshot-assisted entry

- User selects a screenshot from the device.
- On-device text extraction proposes payout, mileage, and merchant.
- BL confirms every field before scoring.
- Screenshots are not automatically collected.

### V1.2 — Mapping and recovery mileage

- BL enters or confirms pickup and destination locations.
- Mapping integration estimates route time and return-to-staging distance.
- Zone classifications become polygon/corridor based rather than simple labels.

### V1.3 — Shift analytics

- Saturday-to-Saturday comparison.
- Restaurant wait averages.
- Time-block profitability.
- Accepted versus declined offer analysis.
- Recommended threshold adjustments.

### V2 — Multi-platform operation

- Uber Eats restaurant-offer model.
- DoorDash Shop & Deliver shopping model.
- Spark pickup, shopping, batch, and multi-stop models.
- Conflict handling when offers arrive from multiple platforms.

### V3 — Predictive operations

- Learn restaurant wait distributions.
- Predict destination recovery time.
- Estimate probability of a better offer during peak periods.
- Recommend staging changes based on the team's own historical results.

## 8. Deployment plan

### Pilot

Run locally or on a private HTTPS host. Install it on BL's phone/tablet as a Progressive Web App.

### Small production deployment

- Static web hosting for the app.
- Optional encrypted cloud synchronization between BL and JF devices.
- Authenticated team accounts.
- Automated backups and exports.

### Scaled deployment

- Multi-driver operations dashboard.
- Role-based permissions.
- Driver, vehicle, platform, and market profiles.
- Central analytics and route intelligence.

## 9. Acceptance criteria for this MVP

- Works on a modern mobile browser.
- Scores an offer without a DoorDash login.
- Produces separate BL and JF instructions.
- Saves settings and restaurant intelligence locally.
- Tracks shift breaks and completed-delivery performance.
- Exports a usable CSV.
- Remains functional offline after installation/cache.
