import { createContext, useContext } from 'react';

// Holds the resolved home-page experience for this visitor (or null when no
// experiment is running). App resolves it once; Home renders its page.
export const ExperimentContext = createContext(null);
export const useHomeExperience = () => useContext(ExperimentContext);
