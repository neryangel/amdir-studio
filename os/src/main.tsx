import '@fontsource/ibm-plex-sans-hebrew/hebrew-400.css';
import '@fontsource/ibm-plex-sans-hebrew/hebrew-500.css';
import '@fontsource/ibm-plex-sans-hebrew/hebrew-700.css';
import '@fontsource/ibm-plex-sans-hebrew/latin-400.css';
import '@fontsource/ibm-plex-sans-hebrew/latin-500.css';
import '@fontsource/ibm-plex-sans-hebrew/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './styles/tokens.css';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './app/App';
import { AnnouncerProvider } from './app/announcer';
import { createDemoStudio } from './app/bootstrap';
import { SessionProvider } from './app/session';
import { StudioProvider } from './app/StudioContext';
import { browserStorage } from './data/storage';

const storage = browserStorage();
const studio = createDemoStudio(storage);
const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <StudioProvider studio={studio}>
        <SessionProvider storage={storage}>
          <AnnouncerProvider>
            <App />
          </AnnouncerProvider>
        </SessionProvider>
      </StudioProvider>
    </BrowserRouter>
  </StrictMode>,
);
