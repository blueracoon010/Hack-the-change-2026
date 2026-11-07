// Rename the project here once you pick your idea. Also update <title> in index.html and electron/main.cjs.
export const APP = {
  name: 'Project Spark',
  tagline: 'Real Alberta energy data, made understandable for every Calgarian.',
  org: 'Code the Change YYC',
}

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
