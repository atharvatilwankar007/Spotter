import { BarChart3, Dumbbell, LayoutList } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Finish } from './components/Finish';
import { Program } from './components/Program';
import { Progress } from './components/Progress';
import { SessionScreen } from './components/Session';
import { Today } from './components/Today';
import { thump } from './lib/native';
import { useStore } from './lib/store';

type Tab = 'today' | 'progress' | 'program';
const TABS: { id: Tab; label: string; Icon: typeof Dumbbell }[] = [
  { id: 'today', label: 'Today', Icon: Dumbbell },
  { id: 'progress', label: 'Progress', Icon: BarChart3 },
  { id: 'program', label: 'Program', Icon: LayoutList },
];

export default function App() {
  const active = useStore((s) => s.active);
  const [tab, setTab] = useState<Tab>('today');
  const [finished, setFinished] = useState<string | null>(null);

  if (finished)
    return (
      <div className="app">
        <Finish
          id={finished}
          onClose={() => {
            setFinished(null);
            setTab('today');
          }}
        />
      </div>
    );

  if (active)
    return (
      <div className="app">
        <SessionScreen onFinished={(id) => setFinished(id)} />
      </div>
    );

  return (
    <div className="app">
      <main className="page">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            {tab === 'today' && <Today />}
            {tab === 'progress' && <Progress />}
            {tab === 'program' && <Program />}
          </motion.div>
        </AnimatePresence>
      </main>
      <nav className="tabbar">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`tab ${tab === id ? 'on' : ''}`}
            onClick={() => {
              if (tab !== id) thump();
              setTab(id);
            }}
          >
            {tab === id && <motion.span layoutId="tab-pill" className="tab-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <Icon size={20} strokeWidth={2.2} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
