import { useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, ClipboardList, FileText, UserCircle, X, Eye, LogOut, Globe, Image as ImageIcon, RefreshCw, Zap, Layers, ExternalLink, Target, Lightbulb, TrendingUp, Shield, BarChart3, Users, Cpu, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';

type ToolCard = {
  title: string;
  tagline: string;
  description: string;
  features: string[];
  icon: ReactNode;
  iconBg: string;
  accentColor: string;
  buttonClass: string;
  dotColor: string;
  actionLabel: string;
  onAction: () => void;
  badge?: string;
};

type LaunchPadProps = {
  domainLabel: string;
  onLaunchArticleGenerator: () => void;
  onLaunchFormSubmission: () => void;
  onLaunchWebScraper: () => void;
  onLaunchImageEditor: () => void;
  onLaunchFormBuilder: () => void;
  onLaunchUpdateFormSubmission: () => void;
};

export default function LaunchPad({ onLaunchArticleGenerator, onLaunchFormSubmission, onLaunchWebScraper, onLaunchImageEditor, onLaunchUpdateFormSubmission, onLaunchFormBuilder }: LaunchPadProps) {
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileRow, setProfileRow] = useState<{
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    role: string;
    created_at: string;
    updated_at: string;
  } | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('rpc_profile_get').then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : null;
      if (row?.full_name) setUserName(row.full_name);
    });
  }, []);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  const openAccountModal = useCallback(async () => {
    setShowAccountModal(true);
    setProfileLoading(true);
    setProfileError(null);
    setProfileSaveError(null);
    setProfileSaveSuccess(null);
    setIsEditingProfile(false);
    try {
      const { data, error: rpcError } = await supabase.rpc('rpc_profile_get');
      if (rpcError) throw rpcError;
      const row = Array.isArray(data) ? data[0] : null;
      setProfileRow(row ?? null);
      setEditFullName((row?.full_name ?? '') as string);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load profile';
      setProfileError(msg);
      setProfileRow(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const saveProfile = useCallback(async () => {
    if (!profileRow) return;
    setProfileSaving(true);
    setProfileSaveError(null);
    setProfileSaveSuccess(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('rpc_profile_update', {
        p_full_name: editFullName.trim() || null,
        p_avatar_url: null,
      });
      if (rpcError) throw rpcError;
      const row = Array.isArray(data) ? data[0] : null;
      setProfileRow(row ?? profileRow);
      setEditFullName(((row?.full_name ?? editFullName) as string) ?? '');
      setIsEditingProfile(false);
      setProfileSaveSuccess('Profile updated successfully.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update profile';
      setProfileSaveError(msg);
    } finally {
      setProfileSaving(false);
    }
  }, [editFullName, profileRow]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const openJomasterTest = useCallback(() => {
    window.open('https://dojomaster-test.netlify.app', '_blank', 'noopener,noreferrer');
  }, []);

  const contentTools: ToolCard[] = [
    {
      title: 'Article Generator',
      tagline: 'AI-Powered Content Creation',
      description: 'Create, rewrite, and manage articles with an intelligent workflow. Generate SEO-friendly content and maintain a library of saved pieces.',
      features: ['AI-assisted writing & rewriting', 'Content library with versions', 'Export-ready formatted output'],
      icon: <FileText className="w-5 h-5" />,
      iconBg: 'bg-blue-50 text-blue-600',
      accentColor: 'border-t-blue-500',
      buttonClass: 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/25',
      dotColor: 'bg-blue-500',
      actionLabel: 'Open Tool',
      onAction: onLaunchArticleGenerator,
    },
    {
      title: 'Image Content Editor',
      tagline: 'Professional Image Editing',
      description: 'Edit and enhance images with filters, text overlays, and transformations. Export optimized images with social media-ready shareable links.',
      features: ['Brightness, contrast & filters', 'Text overlay positioning', 'Social media export & sharing'],
      icon: <ImageIcon className="w-5 h-5" />,
      iconBg: 'bg-rose-50 text-rose-600',
      accentColor: 'border-t-rose-500',
      buttonClass: 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/25',
      dotColor: 'bg-rose-500',
      actionLabel: 'Open Tool',
      onAction: onLaunchImageEditor,
    },
    {
      title: 'Web Scraper',
      tagline: 'Automated Data Extraction',
      description: 'Extract pages, metadata, and structured content from tracked websites. Monitor changes and manage your crawling pipeline.',
      features: ['Website selection & scheduling', 'Structured content extraction', 'Pipeline monitoring & logs'],
      icon: <Globe className="w-5 h-5" />,
      iconBg: 'bg-violet-50 text-violet-600',
      accentColor: 'border-t-violet-500',
      buttonClass: 'bg-violet-600 hover:bg-violet-700 shadow-violet-600/25',
      dotColor: 'bg-violet-500',
      actionLabel: 'Open Tool',
      onAction: onLaunchWebScraper,
    },
  ];

  const dataTools: ToolCard[] = [
    {
      title: 'Custom Form Builder',
      tagline: 'Forms We Own',
      description: 'Build a form once and embed one line on the site. Submissions post straight to that client’s GoHighLevel. Change a field here and every site has it immediately — nothing to republish.',
      features: ['Fields, wording and redirects', 'Straight to GoHighLevel', 'One embed, updates everywhere'],
      icon: <ClipboardList className="w-5 h-5" />,
      iconBg: 'bg-indigo-50 text-indigo-600',
      accentColor: 'border-t-indigo-500',
      buttonClass: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/25',
      dotColor: 'bg-indigo-500',
      actionLabel: 'Open Tool',
      onAction: onLaunchFormBuilder,
    },
    {
      title: 'Form Submissions',
      tagline: 'Centralized Lead Management',
      description: 'View, search, and manage all form submissions from your websites in one unified dashboard. Track history and manage contacts.',
      features: ['Unified inbox across sites', 'Contact record management', 'Real-time submission tracking'],
      icon: <ClipboardList className="w-5 h-5" />,
      iconBg: 'bg-emerald-50 text-emerald-600',
      accentColor: 'border-t-emerald-500',
      buttonClass: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25',
      dotColor: 'bg-emerald-500',
      actionLabel: 'Open Tool',
      onAction: onLaunchFormSubmission,
    },
    {
      title: 'Form Integrations',
      tagline: 'Integration & Routing Overview',
      description: 'See exactly where your form submissions are routed. Track CRM syncs, webhook destinations, and redirect flows across all sites.',
      features: ['Integration mapping per site', 'CRM & webhook tracking', 'Captured contacts overview'],
      icon: <RefreshCw className="w-5 h-5" />,
      iconBg: 'bg-cyan-50 text-cyan-600',
      accentColor: 'border-t-cyan-500',
      buttonClass: 'bg-cyan-600 hover:bg-cyan-700 shadow-cyan-600/25',
      dotColor: 'bg-cyan-500',
      actionLabel: 'Open Tool',
      onAction: onLaunchUpdateFormSubmission,
    },
    {
      title: 'Dojomaster Test',
      tagline: 'Academy Management Platform',
      description: 'Martial arts academy management for attendance, memberships, class scheduling, payments, and HighLevel integration.',
      features: ['Attendance & scheduling', 'Membership & payments', 'HighLevel student sync'],
      icon: <Eye className="w-5 h-5" />,
      iconBg: 'bg-purple-50 text-purple-600',
      accentColor: 'border-t-purple-500',
      buttonClass: 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/25',
      dotColor: 'bg-purple-500',
      actionLabel: 'Open Site',
      onAction: openJomasterTest,
      badge: 'External',
    },
  ];

  const renderCard = (tool: ToolCard) => (
    <div
      key={tool.title}
      className={`group relative rounded-2xl bg-white border border-gray-100 border-t-[3px] ${tool.accentColor} shadow-sm hover:shadow-xl hover:shadow-gray-200/60 hover:-translate-y-1 transition-all duration-300 overflow-hidden`}
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className={`w-12 h-12 rounded-2xl ${tool.iconBg} flex items-center justify-center`}>
            {tool.icon}
          </div>
          {tool.badge && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
              <ExternalLink className="w-2.5 h-2.5" />
              {tool.badge}
            </span>
          )}
        </div>

        {/* Title & Tagline */}
        <h3 className="text-lg font-bold text-gray-900 mb-1">{tool.title}</h3>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">{tool.tagline}</p>

        {/* Description */}
        <p className="text-[13px] text-gray-500 leading-relaxed mb-5">{tool.description}</p>

        {/* Divider */}
        <div className="border-t border-gray-100 mb-5" />

        {/* Features */}
        <div className="space-y-3 mb-6">
          {tool.features.map((f) => (
            <div key={f} className="flex items-center gap-3 text-[13px] text-gray-600">
              <div className={`w-1.5 h-1.5 rounded-full ${tool.dotColor} flex-shrink-0`} />
              <span>{f}</span>
            </div>
          ))}
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={tool.onAction}
          className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-xl text-white ${tool.buttonClass} shadow-lg transition-all duration-200 group/btn`}
        >
          {tool.actionLabel}
          <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform duration-200" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50/80 text-gray-900">
      {/* Top Navigation */}
      <nav className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-gray-200/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img
                src="/image/icon.png"
                alt="Ground Standard"
                className="w-8 h-8"
              />
              <span className="text-lg font-bold text-gray-900 tracking-tight">Ground Standard</span>
            </div>
            <button
              type="button"
              onClick={openAccountModal}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl shadow-sm hover:shadow transition-all duration-200"
            >
              <UserCircle className="w-4 h-4" />
              Account
            </button>
          </div>
        </div>
      </nav>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Hero Section */}
        <div className="relative text-center mb-14">
          {/* Background decoration */}
          <div className="absolute inset-0 -top-16 pointer-events-none overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-blue-100/40 via-indigo-50/30 to-transparent rounded-full blur-3xl" />
          </div>

          <div className="relative">
            {/* Welcome message */}
            <p className="text-base sm:text-lg text-gray-500 mb-3">
              {greeting}{userName ? `, ${userName}` : ''}! Welcome back.
            </p>
            <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg shadow-blue-600/25 text-white text-xs font-bold uppercase tracking-widest mb-8">
              <Zap className="w-3.5 h-3.5" />
              Content Management Platform
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-gray-900 mb-6 tracking-tight leading-[1.05]">
              Your tools,<br />
              <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-600 bg-clip-text text-transparent">all in one place</span>
            </h1>
            <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed mb-10">
              Manage content, track submissions, extract data, and edit images — <span className="text-gray-700 font-semibold">everything you need</span> from a single dashboard.
            </p>

            {/* Stats Bar */}
            <div className="inline-flex items-center gap-6 px-6 py-3 rounded-2xl bg-white/90 backdrop-blur-sm shadow-lg border border-white/30">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-semibold text-gray-700">Secure</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-sm font-semibold text-gray-700">Real-time</span>
              </div>
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-sm font-semibold text-gray-700">6 Tools</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content & Creative Section */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Content & Creative</h2>
              <p className="text-xs text-gray-400">Create, edit, and extract content</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {contentTools.map(renderCard)}
          </div>
        </div>

        {/* Data & Operations Section */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <ClipboardList className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Data & Operations</h2>
              <p className="text-xs text-gray-400">Manage submissions, integrations, and more</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {dataTools.map(renderCard)}
          </div>
        </div>

        {/* Platform Features */}
        <div className="mt-16 mb-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-3">Why Ground Standard?</h2>
            <p className="text-sm sm:text-base text-gray-500 max-w-xl mx-auto">Built to simplify how martial arts businesses manage their digital presence — from content to leads to operations.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="text-center p-6 rounded-2xl bg-white border border-gray-100 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
                <Cpu className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-1">AI-Powered</h3>
              <p className="text-xs text-gray-500 leading-relaxed">Generate articles, captions, and tags automatically with built-in AI assistance.</p>
            </div>
            <div className="text-center p-6 rounded-2xl bg-white border border-gray-100 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-1">Secure & Private</h3>
              <p className="text-xs text-gray-500 leading-relaxed">Role-based access control with row-level security on every table and operation.</p>
            </div>
            <div className="text-center p-6 rounded-2xl bg-white border border-gray-100 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
                <Clock className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-1">Real-Time Data</h3>
              <p className="text-xs text-gray-500 leading-relaxed">Live submission tracking, instant form updates, and real-time sync across all tools.</p>
            </div>
            <div className="text-center p-6 rounded-2xl bg-white border border-gray-100 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-1">Scalable</h3>
              <p className="text-xs text-gray-500 leading-relaxed">Handle thousands of articles, images, and submissions without slowing down.</p>
            </div>
          </div>
        </div>

        {/* Mission & Vision */}
        <div className="mb-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Mission */}
            <div className="relative rounded-2xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-indigo-700" />
              <div className="relative p-8 sm:p-10">
                <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center mb-5">
                  <Target className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-extrabold text-white mb-3">Our Mission</h3>
                <p className="text-sm text-blue-100 leading-relaxed mb-4">
                  To empower martial arts academies and small businesses with enterprise-grade digital tools — making content creation, lead management, and online operations accessible, efficient, and affordable.
                </p>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2.5 text-sm text-blue-100">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-300 flex-shrink-0" />
                    <span>Simplify complex digital workflows</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-sm text-blue-100">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-300 flex-shrink-0" />
                    <span>Save time with intelligent automation</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-sm text-blue-100">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-300 flex-shrink-0" />
                    <span>Deliver results that grow businesses</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Vision */}
            <div className="relative rounded-2xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-600 to-purple-700" />
              <div className="relative p-8 sm:p-10">
                <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center mb-5">
                  <Lightbulb className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-extrabold text-white mb-3">Our Vision</h3>
                <p className="text-sm text-violet-100 leading-relaxed mb-4">
                  To become the go-to platform for martial arts businesses worldwide — where every academy, from a single-location dojo to a multi-branch network, has the tools to thrive in the digital age.
                </p>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2.5 text-sm text-violet-100">
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-300 flex-shrink-0" />
                    <span>One platform for all digital operations</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-sm text-violet-100">
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-300 flex-shrink-0" />
                    <span>Innovation that serves real business needs</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-sm text-violet-100">
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-300 flex-shrink-0" />
                    <span>A community of empowered academy owners</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>


        {/* Built For Section */}
        <div className="mb-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-3">Built for Martial Arts Businesses</h2>
          <p className="text-sm sm:text-base text-gray-500 max-w-xl mx-auto mb-8">From BJJ academies to MMA gyms — we understand the unique needs of combat sports businesses.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="p-6 rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-2">Academy Owners</h3>
              <p className="text-xs text-gray-500 leading-relaxed">Manage your digital content, track form leads, and keep your website content fresh without needing a marketing team.</p>
            </div>
            <div className="p-6 rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-2">Marketing Teams</h3>
              <p className="text-xs text-gray-500 leading-relaxed">Create SEO articles at scale, manage image content for social media, and track where every lead goes.</p>
            </div>
            <div className="p-6 rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
                <Globe className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-2">Multi-Location Networks</h3>
              <p className="text-xs text-gray-500 leading-relaxed">Manage multiple websites, track submissions across all locations, and maintain consistent content everywhere.</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-8 border-t border-gray-200/60 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img src="/image/icon.png" alt="Ground Standard" className="w-6 h-6" />
            <span className="text-sm font-bold text-gray-900">Ground Standard</span>
          </div>
          <p className="text-xs text-gray-400 mb-2">
            Your powerful content management platform for martial arts businesses.
          </p>
          <p className="text-[11px] text-gray-300">
            &copy; {new Date().getFullYear()} Ground Standard. All rights reserved.
          </p>
        </div>
      </div>

      {/* Account Modal */}
      {showAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAccountModal(false)} />
          <div className="relative bg-white w-full max-w-xl mx-auto rounded-2xl shadow-2xl border border-gray-200 z-10 overflow-hidden">
            <div className="px-8 pt-7 pb-5 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                    <UserCircle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Account</h3>
                    <p className="text-sm text-gray-500">Manage your profile details</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAccountModal(false)}
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all duration-200"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {profileLoading ? (
              <div className="px-8 py-8 text-sm text-gray-500">Loading profile...</div>
            ) : profileError ? (
              <div className="px-8 py-8 text-sm text-red-600">{profileError}</div>
            ) : !profileRow ? (
              <div className="px-8 py-8 text-sm text-gray-500">No profile found.</div>
            ) : (
              <div className="px-8 py-6 space-y-6">
                <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Profile</div>
                      <div className="text-base font-bold text-gray-900">Your details</div>
                    </div>
                    {!isEditingProfile && (
                      <button
                        type="button"
                        onClick={() => {
                          setProfileSaveError(null);
                          setProfileSaveSuccess(null);
                          setEditFullName((profileRow.full_name ?? '') as string);
                          setIsEditingProfile(true);
                        }}
                        className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-all duration-200"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Edit
                      </button>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Full name</label>
                      {isEditingProfile ? (
                        <input
                          type="text"
                          value={editFullName}
                          onChange={(e) => setEditFullName(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-400"
                          placeholder="Your name"
                        />
                      ) : (
                        <div className="px-4 py-3 border border-gray-200 rounded-xl bg-white text-sm font-medium text-gray-900">
                          {profileRow.full_name || '—'}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Role</label>
                      <div className="px-4 py-3 border border-gray-200 rounded-xl bg-white text-sm font-medium text-gray-900">
                        {profileRow.role}
                      </div>
                    </div>
                  </div>

                  {profileSaveError && (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                      {profileSaveError}
                    </div>
                  )}
                  {profileSaveSuccess && (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                      {profileSaveSuccess}
                    </div>
                  )}

                  {isEditingProfile && (
                    <div className="flex items-center justify-end gap-2 mt-5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingProfile(false);
                          setEditFullName((profileRow.full_name ?? '') as string);
                          setProfileSaveError(null);
                          setProfileSaveSuccess(null);
                        }}
                        disabled={profileSaving}
                        className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl border border-gray-200 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveProfile}
                        disabled={profileSaving}
                        className="px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm disabled:opacity-50"
                      >
                        {profileSaving ? 'Saving...' : 'Save changes'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-400">You can update your name anytime.</div>
                  <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(true)}
                    className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-gray-700 bg-white hover:bg-red-50 hover:text-red-600 border border-gray-200 hover:border-red-200 rounded-xl transition-all duration-200"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowLogoutConfirm(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-red-50 border border-red-200 text-red-500 flex items-center justify-center">
                    <LogOut className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Confirm logout</h3>
                    <p className="text-xs text-gray-500">Are you sure you want to log out?</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all duration-200"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="px-6 py-5">
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl border border-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowLogoutConfirm(false);
                    await handleLogout();
                  }}
                  className="px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
