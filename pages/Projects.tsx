import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SectionWrapper from '../components/ui/SectionWrapper';
import { Project } from '../types';

const projectsData: Project[] = [
  { id: 1, title: 'Neon Nights', category: 'Video', image: 'https://placehold.co/600x400/222/881078/png?text=Neon+Nights', description: 'Music Video Production' },
  { id: 2, title: 'Urban Flow', category: 'Fotografía', image: 'https://placehold.co/600x400/222/2AE7E4/png?text=Urban+Flow', description: 'Streetwear Campaign' },
  { id: 3, title: 'Zen Brand', category: 'Branding', image: 'https://placehold.co/600x400/222/ffffff/png?text=Zen+Brand', description: 'Wellness Identity' },
  { id: 4, title: 'Tech Future', category: 'Video', image: 'https://placehold.co/600x400/333/2AE7E4/png?text=Tech+Expo', description: 'Event Coverage' },
  { id: 5, title: 'Culinary Art', category: 'Fotografía', image: 'https://placehold.co/600x400/333/881078/png?text=Culinary', description: 'Restaurant Menu' },
  { id: 6, title: 'Eco Life', category: 'Branding', image: 'https://placehold.co/600x400/333/white/png?text=Eco+Life', description: 'Packaging Design' },
  { id: 7, title: 'Speed Run', category: 'Video', image: 'https://placehold.co/600x400/111/red/png?text=Speed', description: 'Automotive Commercial' },
  { id: 8, title: 'Minimalist', category: 'Diseño', image: 'https://placehold.co/600x400/111/gray/png?text=Minimalist', description: 'Web UI Kit' },
];

const Projects: React.FC = () => {
  const [filter, setFilter] = useState<'Todos' | 'Video' | 'Fotografía' | 'Diseño' | 'Branding'>('Todos');

  const filteredProjects = filter === 'Todos' 
    ? projectsData 
    : projectsData.filter(p => p.category === filter || (filter === 'Diseño' && p.category === 'Branding'));

  const categories = ['Todos', 'Video', 'Fotografía', 'Diseño', 'Branding'];

  return (
    <div className="pt-24 min-h-screen">
      {/* Glassmorphism content wrapper */}
      <div className="relative z-10 bg-black/40 backdrop-blur-xl min-h-screen">
      <SectionWrapper className="container mx-auto px-6 mb-12 pb-12">
        <h1 className="text-4xl md:text-6xl font-display font-bold mb-8 text-center">Portfolio</h1>
        
        {/* Filter Bar */}
        <div className="flex flex-wrap justify-center gap-4 mb-12">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat as any)}
              className={`px-6 py-2 rounded-full text-sm font-bold uppercase tracking-wider transition-all duration-300 ${
                filter === cat 
                  ? 'bg-gradient-to-r from-quepia-purple to-quepia-cyan text-white shadow-lg shadow-quepia-purple/30' 
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid */}
        <motion.div 
          layout
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
        >
          <AnimatePresence>
            {filteredProjects.map((project) => (
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
                key={project.id}
                className="group relative cursor-pointer"
              >
                <div className="aspect-[4/3] overflow-hidden rounded-xl bg-gray-900 relative">
                  <img 
                    src={project.image} 
                    alt={project.title} 
                    className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-quepia-dark/90 via-transparent to-transparent opacity-60 group-hover:opacity-90 transition-opacity duration-300" />
                  
                  <div className="absolute bottom-0 left-0 p-6 translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                    <p className="text-quepia-cyan text-xs font-bold uppercase tracking-wider mb-1">{project.category}</p>
                    <h3 className="text-2xl font-display font-bold text-white mb-1">{project.title}</h3>
                    <p className="text-gray-300 text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-100">{project.description}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </SectionWrapper>
      </div>{/* End glassmorphism wrapper */}
    </div>
  );
};

export default Projects;