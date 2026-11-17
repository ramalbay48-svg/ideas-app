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


## Backend foundation

A starter database migration is in `supabase/schema.sql`. It is intended for a **new, dedicated IDEAS APP Supabase project**, not the separate JM SHOP project. It defines profiles, approved tipsters, slips, private slip-asset records, purchases, payment transactions, result reviews, announcements, audit logs and settings with row-level security.

This is a foundation only. It does not connect the frontend, create credentials, configure private Storage policies, implement a payment gateway, or make the current demo login/admin screens secure. Do not publish real customer or payment data until those pieces are completed and tested.


## Admin-verified tipster result reports

The Tipster app lets approved tipsters report a completed slip as WON or LOST and upload a private proof screenshot. Reports remain pending until an administrator confirms or rejects them in the Management app. The result-review function writes each decision to the admin audit log.

For an existing IDEAS APP Supabase project, run `supabase/migrations/20261117_admin_verified_results.sql` in the IDEAS APP Supabase SQL Editor before testing result submissions. The migration creates the private evidence bucket and storage policies, restricts tipster submissions to pending claims for their own completed slips, prevents direct client-side result approval, and installs the admin review RPC. Do not run this in JM SHOP.

## Supabase browser connection (initial)

The frontend now loads Supabase JS v2 and initializes a browser client with the IDEAS APP project URL and its publishable key. It performs a small read-only connection check against the announcements table and displays a connection status. This does **not** enable real customer authentication, tipster uploads, purchases, payment processing, or slip unlocking. Those require the agreed authentication design and secure server-side functions. The publishable key is public by design; never add a Supabase secret key or service-role key to browser files.
