# ☁️ Nimbus - A Weather App That Matches the Sky

Nimbus is a responsive weather app built with **plain HTML, CSS and JavaScript** (no frameworks, no build tools). Its look changes with the weather outside: colours fade between themes, and rain, snow, stars, clouds and lightning animate in the background.

**Live demo:** https://YOUR-USERNAME.github.io/nimbus-weather-app/

![Nimbus screenshot](screenshot.png)

## ✨ Features

- 🔎 **City search with autocomplete** (keyboard friendly: arrow keys, Enter, Esc)
- 📍 **"Use my location"** button using the browser Geolocation API
- 🌡️ **°C / °F toggle**, remembered between visits
- 🌤️ **Current conditions:** temperature, feels like, high/low, humidity, wind (with direction arrow), UV index, pressure, rain chance, cloud cover
- ⏱️ **24-hour forecast** strip and 📅 **7-day forecast** with temperature range bars
- 🌅 **Sun arc** showing sunrise, sunset and where the sun is right now
- 🎨 **Dynamic themes:** 10 day/night weather palettes with animated canvas effects (rain, snow, stars, drifting clouds, lightning)
- 👕 **Plain-English advice** on what to wear and what to watch out for
- 🚶 **Best time to go outside:** scans the rest of today's daylight hours and picks the most pleasant one
- 🕘 **Recent searches** saved in `localStorage`
- ♿ Accessible and responsive: ARIA labels, focus styles, reduced-motion support, works on phones

## 🛠️ Built With

| Part | What it does |
| --- | --- |
| HTML5 | Page structure |
| CSS3 | Glassmorphism cards, CSS Grid, custom properties, `@property` colour transitions |
| JavaScript (ES6+) | `fetch`, `async/await`, DOM updates, Canvas 2D animation, `localStorage` |
| [Open-Meteo](https://open-meteo.com/) | Free weather and geocoding APIs (no API key needed) |
| [BigDataCloud](https://www.bigdatacloud.com/) | Free reverse geocoding for the location button |

## 🚀 Getting Started

1. **Clone the repo**
   ```bash
   git clone https://github.com/YOUR-USERNAME/nimbus-weather-app.git
   cd nimbus-weather-app
   ```
2. **Run it.** Open the folder in VS Code and use the **Live Server** extension on `index.html`.
   You can also just open `index.html` in a browser, but the location button needs `http://localhost` or HTTPS.
3. No installation, API keys or build step required.

## 📁 Project Structure

```
nimbus-weather-app/
├── index.html   # Page structure and element ids
├── style.css    # Themes, layout and components
└── script.js    # API calls, rendering, animation and search logic
```

## 🧠 How It Works

1. The user searches for a city (or taps the location button).
2. The app asks the Open-Meteo **geocoding API** for matching places.
3. It sends the chosen latitude and longitude to the Open-Meteo **forecast API** and receives current, hourly and daily data as JSON.
4. `render()` writes that data into the page and sets `data-theme` and `data-time` on `<body>`, which repaints the sky with CSS variables.
5. A canvas animation layer picks rain, snow, stars, clouds or floating light to match the weather.
6. Small helper functions turn the raw numbers into advice and the "best time outside" suggestion.

## 🔮 Possible Improvements

- Air quality and pollen cards
- Favourite cities
- Weather alerts
- Installable PWA with offline support
- Light/dark mode override

## 🙏 Credits

- Weather and geocoding data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0)
- Font: [Outfit](https://fonts.google.com/specimen/Outfit) via Google Fonts

---

Made by **PRIYANK MISTRY**
