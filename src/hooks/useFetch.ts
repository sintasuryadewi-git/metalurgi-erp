import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export function useFetch<T>(endpoint: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!endpoint) return;
      
      setLoading(true);
      try {
        const res = await apiClient(endpoint);
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.error || 'Gagal mengambil data');
        }

        // Handle jika data dibungkus dalam properti 'data' atau langsung array
        setData(json.data !== undefined ? json.data : json); 
      } catch (err: any) {
        console.error("Fetch Error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [endpoint]);

  return { data, loading, error };
}