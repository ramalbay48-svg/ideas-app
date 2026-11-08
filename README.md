# IDEAS APP

A mobile-first sports tipster marketplace prototype for Tanzania.

## Current stage
This repository contains the first frontend foundation only. The marketplace uses clearly labelled demo content. Authentication, database storage, image uploads, payment initiation, payment verification, and slip unlocking are **not connected** yet.

## Approved product direction
- Dark-first premium interface with neon-green accents and a light-mode option.
- Customer accounts, tipster profiles, and an admin-managed marketplace.
- Paid access to individual betslips; a slip stays covered until the backend confirms payment.
- TZS pricing and intended mobile-money methods: M-Pesa, Tigo Pesa, Airtel Money, and HaloPesa.
- Tipster approval, verified results, performance reporting, notifications, and admin controls.

## Run locally
Open `index.html` in a browser, or use GitHub Pages after reviewing and explicitly approving a deployment.

## Planned secure implementation
The next engineering stage is to add a real backend (Firebase Auth, Firestore, and Cloud Functions or an equivalent secure service). Payment status must only be trusted when verified server-side with the approved provider. Never put provider secrets in browser code.

## Safety and release notes
- Demo slips and prices are illustrative, not real betting advice.
- No real payments are enabled.
- Do not deploy as a production betting/payment service until legal requirements, age restrictions, provider approval, security rules, and end-to-end tests have been completed.
