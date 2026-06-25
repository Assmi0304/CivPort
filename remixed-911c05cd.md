# CivPort — AI-Powered Civic Issue Reporting Platform

**Vibe2Ship Hackathon (Coding Ninjas x GDG)** | Problem Statement 2: Community Hero — Hyperlocal Problem Solver

🔗 **Live App:** [Add your deployed link here]

---

## What is CivPort?

CivPort is an AI-powered civic reporting platform. Citizens upload photos of local issues, Gemini verifies and categorizes them, and reports appear on a community map. Local residents help validate issues through area-based upvoting, while authorities receive prioritized hot-zone insights to resolve problems faster.

Communities frequently face issues like potholes, water leakages, damaged streetlights, and waste management problems — but reporting them is usually fragmented, hard to track, and lacks transparency. CivPort fixes that by combining AI verification, real-time mapping, and community-driven validation into one transparent loop: **report → verify → track → resolve.**

---

## Key Features

- **AI-Powered Issue Classification** — Gemini analyzes each uploaded photo and description to categorize the issue (pothole, streetlight, garbage, water leak) and assign a severity level
- **Authenticity & Spam Detection** — Gemini checks whether the photo genuinely matches the reported issue and flags spam or fake reports before they go public
- **Interactive Civic Map** — Built with Leaflet.js and OpenStreetMap, showing every reported issue as a color-coded pin based on status
- **Community Upvoting** — Citizens can verify issues they've also witnessed, helping surface genuinely widespread problems
- **Real-Time Status Tracking** — Issues move through a clear lifecycle: Reported → Verified → In Progress → Resolved
- **Admin Dashboard** — A prioritized view for authorities to see and act on the most reported/upvoted issues
- **Anonymous Reporting** — Citizens report and engage under a handle, not their real identity, encouraging honest reporting without fear of backlash

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (scaffolded via Google AI Studio) |
| AI Engine | Gemini API (multimodal — image + text analysis) |
| Database | Firebase Firestore |
| Authentication | Firebase Authentication (Anonymous) |
| Map | Leaflet.js + OpenStreetMap |
| Geolocation | Browser Geolocation API + Nominatim (reverse geocoding) |

---

## Google Technologies Utilized

- **Google AI Studio** — used to build and deploy the entire application
- **Gemini API** — multimodal AI pipeline for issue categorization, severity scoring, authenticity verification, and spam detection
- **Firebase (Google Cloud)** — Firestore for the database and Firebase Authentication for anonymous user identity

---

## How It Works

1. A citizen uploads a photo and description of a civic issue, along with their location
2. Gemini analyzes the photo + description and returns a structured classification: category, severity, authenticity, and spam flag
3. If flagged as spam or inauthentic, the report is hidden from the public feed automatically
4. Valid reports appear instantly on the map and in the community feed
5. Other citizens can upvote issues they've also noticed, increasing visibility and priority
6. Authorities use the admin dashboard to view, prioritize, and update the status of issues until resolution

---

## Problem Statement Addressed

**Community Hero — Hyperlocal Problem Solver**

CivPort directly addresses the challenge of fragmented, hard-to-track civic issue reporting by combining AI-driven verification with community participation and transparent tracking — helping both citizens and local authorities resolve problems more efficiently.

---

## Team

Built for the Vibe2Ship Hackathon by Coding Ninjas x Google for Developers.
