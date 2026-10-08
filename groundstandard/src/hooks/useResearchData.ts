import { useState, useEffect } from 'react';
import { supabase, ResearchArticle } from '../lib/supabase';

type UseResearchDataParams = {
  page: number;
  pageSize: number;
  searchTerm?: string;
  statusFilter?: string;
  // 'all', 'unknown' (made before authors were recorded), or a user id.
  createdBy?: string;
};

export function useResearchData({ page, pageSize, searchTerm, statusFilter, createdBy }: UseResearchDataParams) {
  const [articles, setArticles] = useState<ResearchArticle[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArticles = async () => {
    try {
      setLoading(true);
      setError(null);

      const from = Math.max(0, (page - 1) * pageSize);
      const to = Math.max(from, from + pageSize - 1);

      const trimmedSearch = (searchTerm ?? '').trim();
      const searchParam = trimmedSearch ? trimmedSearch : null;
      const statusParam = statusFilter && statusFilter !== 'all' ? statusFilter : null;

      // Everyone's articles go through the original functions, untouched; only a
      // Made by filter uses the _by versions, so the default feed cannot be
      // broken by them.
      const byPerson = !!createdBy && createdBy !== 'all';

      const [{ data: listData, error: listError }, { data: countData, error: countError }] = await Promise.all(
        byPerson
          ? [
              supabase.rpc('rpc_research_list_by', {
                p_from: from,
                p_to: to,
                p_search: searchParam,
                p_status: statusParam,
                p_created_by: createdBy,
              }),
              supabase.rpc('rpc_research_count_by', {
                p_search: searchParam,
                p_status: statusParam,
                p_created_by: createdBy,
              }),
            ]
          : [
              supabase.rpc('rpc_research_list', {
                p_from: from,
                p_to: to,
                p_search: searchParam,
                p_status: statusParam,
              }),
              supabase.rpc('rpc_research_count', {
                p_search: searchParam,
                p_status: statusParam,
              }),
            ]
      );

      if (listError) throw listError;
      if (countError) throw countError;

      setArticles((listData as ResearchArticle[]) || []);
      setTotalCount(typeof countData === 'number' ? countData : 0);
    } catch (err) {
      console.error('Error fetching articles:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch articles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArticles();

    const subscription = supabase
      .channel('research_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'Research',
        },
        (payload) => {
          console.log('Real-time update:', payload);
          fetchArticles();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [page, pageSize, searchTerm, statusFilter, createdBy]);

  return {
    articles,
    totalCount,
    loading,
    error,
    refetch: fetchArticles,
  };
}
