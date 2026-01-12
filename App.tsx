import React from 'react';
import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom';

// Layout
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import GlassBackground from './components/ui/GlassBackground';

// Context
import { ModalProvider } from './context/ModalContext';

// Pages
import Home from './pages/Home';
import Services from './pages/Services';
import Works from './pages/Works';
import About from './pages/About';
import Contact from './pages/Contact';

// Scroll to top helper
const ScrollToTop = () => {
  const { pathname } = useLocation();
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

const App: React.FC = () => {
  return (
    <Router>
      <ModalProvider>
        {/* Fondo animado global - visible en todas las páginas */}
        <GlassBackground />

        <div className="relative flex flex-col min-h-screen font-sans text-white bg-transparent">
          <ScrollToTop />
          <Header />
          <main className="relative z-10 flex-grow bg-transparent">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/servicios" element={<Services />} />
              <Route path="/trabajos" element={<Works />} />
              <Route path="/sobre-nosotros" element={<About />} />
              <Route path="/contacto" element={<Contact />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </ModalProvider>
    </Router>
  );
};

export default App;