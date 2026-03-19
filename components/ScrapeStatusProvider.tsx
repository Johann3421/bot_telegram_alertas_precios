'use client';

import { createContext, useContext, useEffect, useState, useRef } from 'react';

export interface RunningJobInfo {
  jobId: string;
  provider: string;
  startedAt: string;
  itemsFound: number;
  pagesSucceeded: number;
  pagesAttempted: number;
  backendUsed: string | null;
  strategyUsed: string | null;
  elapsedSeconds: number;
}

export interface LastScrapeInfo {
  provider: string;
  status: string;
  finishedAt: string | null;
  itemsFound: number;
  backendUsed: string | null;
  strategyUsed: string | null;
}

export interface ScrapeStatus {
  isRunning: boolean;
  runningJob: RunningJobInfo | null;
  lastScrape: LastScrapeInfo | null;
}

const ScrapeStatusContext = createContext<ScrapeStatus>({
  isRunning: false,
  runningJob: null,
  lastScrape: null,
});

export function useScrapeStatus() {
  return useContext(ScrapeStatusContext);
}

export function ScrapeStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ScrapeStatus>({
    isRunning: false,
    runningJob: null,
    lastScrape: null,
  });
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      const es = new EventSource('/api/scrape/stream');
      esRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as ScrapeStatus & { timestamp: number };
          setStatus({
            isRunning: data.isRunning,
            runningJob: data.runningJob,
            lastScrape: data.lastScrape,
          });
        } catch {
          // ignore malformed frames
        }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        // Reconnect after 5 seconds on error
        retryTimeout = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      if (retryTimeout) clearTimeout(retryTimeout);
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);

  return (
    <ScrapeStatusContext.Provider value={status}>
      {children}
    </ScrapeStatusContext.Provider>
  );
}
