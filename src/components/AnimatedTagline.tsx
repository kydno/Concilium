"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const TAGLINES = [
  "What's on your mind today",
  "Ask Concilium",
  "Mercury 2, three perspectives",
  "Three perspectives, one answer",
  "Deliberate before you decide",
];

const TAGLINE_INTERVAL_MS = 9000;

interface AnimatedTaglineProps {
  visible: boolean;
}

export function AnimatedTagline({ visible }: AnimatedTaglineProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % TAGLINES.length);
    }, TAGLINE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="mb-8 h-10 overflow-hidden text-center">
      <AnimatePresence mode="wait">
        <motion.p
          key={TAGLINES[index]}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.45 }}
          className="text-xl font-light tracking-wide text-zinc-300 sm:text-2xl"
        >
          {TAGLINES[index]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
