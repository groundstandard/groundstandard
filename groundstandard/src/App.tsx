import { useEffect, useState } from 'react';
import Dashboard from './components/Dashboard';
import FormBuilder from './components/FormBuilder';
import FormSubmission from './components/FormSubmission';
import LaunchPad from './components/LaunchPad';
import LoginForm from './components/LoginForm';
import WebScraper from './components/WebScraper';
import ImageContentEditor from './components/ImageContentEditor';
import UpdateFormSubmission from './components/UpdateFormSubmission';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [selectedTool, setSelectedTool] = useState<string | null>(() => sessionStorage.getItem('gs_selected_tool_v1'));

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const forceLogin = sessionStorage.getItem('gs_force_login_v1') === '1';
      setSession(forceLogin ? null : data.session);
      if (!data.session || forceLogin) {
        sessionStorage.removeItem('gs_selected_tool_v1');
        setSelectedTool(null);
      }
      setInitializing(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const forceLogin = sessionStorage.getItem('gs_force_login_v1') === '1';
      setSession(forceLogin ? null : nextSession);
      if (!nextSession || forceLogin) {
        sessionStorage.removeItem('gs_selected_tool_v1');
        setSelectedTool(null);
      }
      setInitializing(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-black">
        <div className="text-sm font-semibold text-white/80">Loading…</div>
      </div>
    );
  }

  if (!session) {
    return <LoginForm />;
  }

  if (!selectedTool) {
    return (
      <LaunchPad
        domainLabel={typeof window !== 'undefined' ? window.location.host : 'groundstandard.netlify.app'}
        onLaunchArticleGenerator={() => {
          sessionStorage.setItem('gs_selected_tool_v1', 'article');
          setSelectedTool('article');
        }}
        onLaunchFormSubmission={() => {
          sessionStorage.setItem('gs_selected_tool_v1', 'form_submission');
          setSelectedTool('form_submission');
        }}
        onLaunchWebScraper={() => {
          sessionStorage.setItem('gs_selected_tool_v1', 'web_scraper');
          setSelectedTool('web_scraper');
        }}
        onLaunchImageEditor={() => {
          sessionStorage.setItem('gs_selected_tool_v1', 'image_editor');
          setSelectedTool('image_editor');
        }}
        onLaunchFormBuilder={() => {
          sessionStorage.setItem('gs_selected_tool_v1', 'form_builder');
          setSelectedTool('form_builder');
        }}
        onLaunchUpdateFormSubmission={() => {
          sessionStorage.setItem('gs_selected_tool_v1', 'update_form_submission');
          setSelectedTool('update_form_submission');
        }}
      />
    );
  }

  const backToLaunch = () => {
    sessionStorage.removeItem('gs_selected_tool_v1');
    setSelectedTool(null);
  };

  if (selectedTool === 'form_builder') {
    return <FormBuilder onBackToLaunch={backToLaunch} />;
  }

  if (selectedTool === 'form_submission') {
    return <FormSubmission onBackToLaunch={backToLaunch} />;
  }

  if (selectedTool === 'web_scraper') {
    return <WebScraper onBackToLaunch={backToLaunch} />;
  }

  if (selectedTool === 'image_editor') {
    return <ImageContentEditor onBackToLaunch={backToLaunch} />;
  }

  if (selectedTool === 'update_form_submission') {
    return <UpdateFormSubmission onBackToLaunch={backToLaunch} />;
  }

  return <Dashboard onBackToLaunch={backToLaunch} />;
}

export default App;