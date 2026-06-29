# TruthLens AI

A full-stack misinformation detection web app powered by Google Gemini AI. Analyze news headlines and messages to detect potential misinformation, manipulation techniques, and credibility scores.

## Features

- Real-time misinformation analysis using Google Gemini AI
- Credibility scoring (0-100)
- Risk level assessment (Low/Medium/High)
- Detection of manipulation techniques
- Visual credibility meter with color-coded indicators
- Example messages for testing (fake and real news)
- Clean, modern, responsive UI

## Tech Stack

**Frontend:**
- React 18
- TypeScript
- Vite
- Tailwind CSS
- Lucide React (icons)

**Backend:**
- Supabase Edge Functions
- Google Gemini AI API

## Prerequisites

Before running the app, you need:

1. A Google Gemini API key
   - Get one at: https://aistudio.google.com/app/apikey
   - The backend currently targets `gemini-3.5-flash`. If Google deprecates this model later, update the model name in `supabase/functions/analyze/index.ts`.

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Google Gemini API Key

The app requires a GEMINI_API_KEY environment variable. Configure it in your Supabase project:

1. Go to your Supabase project dashboard
2. Navigate to Edge Functions secrets
3. Add `GEMINI_API_KEY` with your Google Gemini API key

### 3. Run the Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### 4. Build for Production

```bash
npm run build
```

## How to Use

1. **Enter a message**: Paste any news headline or message into the text box
2. **Click "Analyze Claim"**: The app will send the text to Google Gemini AI for analysis
3. **View results**: See the credibility score, risk level, manipulation techniques, and detailed explanation

### Try the Examples

Click the example buttons to quickly test the analyzer:
- **Fake News Example**: "Hot water cures all viruses. Share immediately!"
- **Real News Example**: "ISRO launches new satellite to monitor climate change."

## Project Structure

```
├── src/
│   ├── components/
│   │   ├── CredibilityMeter.tsx    # Visual credibility score meter
│   │   └── ResultCard.tsx          # Analysis results display
│   ├── types.ts                     # TypeScript interfaces
│   ├── App.tsx                      # Main application component
│   ├── main.tsx                     # React entry point
│   └── index.css                    # Global styles
├── supabase/
│   └── functions/
│       └── analyze/
│           └── index.ts             # Edge function for AI analysis
├── package.json
└── vite.config.ts
```

## API Endpoint

### POST /functions/v1/analyze

Analyzes a message for misinformation using Google Gemini AI.

**Request Body:**
```json
{
  "message": "Your message to analyze"
}
```

**Response:**
```json
{
  "credibilityScore": 85,
  "riskLevel": "Low",
  "manipulationTechniques": ["Sensationalism", "Urgency"],
  "explanation": "Detailed explanation of the analysis"
}
```

## Color System

- **Green**: Low risk (high credibility)
- **Yellow**: Medium risk (moderate credibility)
- **Red**: High risk (low credibility)

## License

MIT
