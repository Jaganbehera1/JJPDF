// Landing page for JJ PDF Studio Pro

import { useState, useRef, useCallback } from 'react';
import {
  FileText,
  Edit3,
  Repeat,
  Combine,
  Scissors,
  Minimize2,
  LayoutGrid,
  PenTool,
  Lock,
  ScanLine,
  Upload,
  Check,
  ArrowRight,
  Shield,
  Zap,
  Cloud,
  Star,
  Menu,
  X,
  ChevronDown,
  HelpCircle,
  Settings,
} from 'lucide-react';

interface LandingPageProps {
  onUpload: (file: File) => void;
}

const TOOLS = [
  { icon: Edit3, name: 'Edit PDF', desc: 'Modify text and images directly in your PDF', color: 'bg-blue-50 text-blue-600' },
  { icon: Repeat, name: 'Convert PDF', desc: 'Convert to and from Word, Excel, images', color: 'bg-emerald-50 text-emerald-600' },
  { icon: Combine, name: 'Merge PDF', desc: 'Combine multiple PDFs into one document', color: 'bg-amber-50 text-amber-600' },
  { icon: Scissors, name: 'Split PDF', desc: 'Extract or divide pages into separate files', color: 'bg-rose-50 text-rose-600' },
  { icon: Minimize2, name: 'Compress PDF', desc: 'Reduce file size while keeping quality', color: 'bg-indigo-50 text-indigo-600' },
  { icon: LayoutGrid, name: 'Organize Pages', desc: 'Reorder, rotate, and delete pages', color: 'bg-cyan-50 text-cyan-600' },
  { icon: PenTool, name: 'Sign PDF', desc: 'Add signatures and fill forms', color: 'bg-purple-50 text-purple-600' },
  { icon: Lock, name: 'Protect PDF', desc: 'Add passwords and permissions', color: 'bg-slate-50 text-slate-600' },
  { icon: ScanLine, name: 'OCR', desc: 'Recognize text in scanned documents', color: 'bg-teal-50 text-teal-600' },
];

const FEATURES = [
  { icon: Zap, title: 'Lightning Fast', desc: 'All processing happens in your browser — no waiting for uploads or server queues.' },
  { icon: Shield, title: 'Private & Secure', desc: 'Your files never leave your device. Everything is processed locally with zero cloud dependency.' },
  { icon: Cloud, title: 'Works Anywhere', desc: 'Use it on any device with a modern browser — desktop, tablet, or phone.' },
  { icon: FileText, title: 'Full Fidelity', desc: 'Original fonts, images, and layout are preserved when you export your edited PDF.' },
];

const FAQS = [
  { q: 'Is JJ PDF Studio Pro really free to use?', a: 'Yes, the core editing tools are completely free and run entirely in your browser. No account required, no watermarks added.' },
  { q: 'Are my files uploaded to a server?', a: 'No. All PDF processing happens locally in your browser using WebAssembly. Your files never leave your device.' },
  { q: 'Can I edit the actual text in my PDF?', a: 'Yes. JJ PDF Studio Pro extracts text content from your PDF and lets you edit it directly. You can change text, fonts, colors, and sizes, then export the result.' },
  { q: 'What file sizes are supported?', a: 'Files up to 50MB are supported for the free tier. Larger files may take longer to process depending on your device.' },
  { q: 'Does it work on mobile devices?', a: 'The editor works on tablets and larger phones, though the full editor experience is optimized for desktop screens.' },
  { q: 'Can I merge and split PDFs?', a: 'Absolutely. You can merge multiple PDFs into one, split a PDF into separate files, and extract specific pages.' },
];

const PRICING = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    features: ['All editing tools', 'Annotations & comments', 'Merge & split', 'OCR text recognition', 'Up to 50MB files', 'Local processing only'],
    cta: 'Get Started',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$9',
    period: 'per month',
    features: ['Everything in Free', 'Up to 200MB files', 'Cloud storage (5GB)', 'Save documents online', 'Batch processing', 'Priority support'],
    cta: 'Start Free Trial',
    highlight: true,
  },
  {
    name: 'Business',
    price: '$29',
    period: 'per month',
    features: ['Everything in Pro', 'Unlimited file size', 'Team collaboration', '100GB cloud storage', 'API access', 'Custom branding'],
    cta: 'Contact Sales',
    highlight: false,
  },
];

export default function LandingPage({ onUpload }: LandingPageProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [mobileMenu, setMobileMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE = 50 * 1024 * 1024;

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        setError('Please select a PDF file. Other formats are not supported.');
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`File is too large. Maximum supported size is 50MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)}MB.`);
        return;
      }
      onUpload(file);
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-sm">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">JJ PDF Studio <span className="text-blue-600">Pro</span></span>
            </div>

            <nav className="hidden md:flex items-center gap-8">
              <a href="#tools" className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors">Tools</a>
              <a href="#features" className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors">Features</a>
              <a href="#pricing" className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors">Pricing</a>
              <a href="#faq" className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors">Help</a>
              <button className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors">Sign In</button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Upload className="w-4 h-4" />
                Upload PDF
              </button>
            </nav>

            <button className="md:hidden p-2" onClick={() => setMobileMenu(!mobileMenu)}>
              {mobileMenu ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {mobileMenu && (
            <div className="md:hidden py-4 border-t border-gray-100 space-y-2">
              <a href="#tools" className="block px-3 py-2 text-sm font-medium text-gray-600 hover:text-blue-600">Tools</a>
              <a href="#features" className="block px-3 py-2 text-sm font-medium text-gray-600 hover:text-blue-600">Features</a>
              <a href="#pricing" className="block px-3 py-2 text-sm font-medium text-gray-600 hover:text-blue-600">Pricing</a>
              <a href="#faq" className="block px-3 py-2 text-sm font-medium text-gray-600 hover:text-blue-600">Help</a>
              <button className="block w-full text-left px-3 py-2 text-sm font-medium text-gray-600">Sign In</button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full mt-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg"
              >
                Upload PDF
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/50 to-white">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_75%)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full mb-6">
              <Zap className="w-3 h-3" />
              100% Browser-Based — Your Files Never Leave Your Device
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 tracking-tight leading-tight">
              Free Online PDF Editor for Text, Images, and Pages
            </h1>
            <p className="mt-6 text-lg text-gray-600 leading-relaxed">
              Edit PDF text and images, add signatures, merge or split documents, and organize pages in your browser. Your files stay on your device.
            </p>
          </div>

          {/* Upload panel */}
          <div className="mt-12 max-w-2xl mx-auto">
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative bg-white rounded-2xl border-2 border-dashed p-10 sm:p-14 text-center cursor-pointer transition-all duration-200 ${
                isDragging ? 'border-blue-500 drag-active bg-blue-50/50 scale-[1.02]' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50/50'
              }`}
            >
              <div className="flex flex-col items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${isDragging ? 'bg-blue-100' : 'bg-blue-50'}`}>
                  <FileText className={`w-8 h-8 ${isDragging ? 'text-blue-600' : 'text-blue-500'}`} />
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-900">Drag and drop your PDF here</p>
                  <p className="text-sm text-gray-500 mt-1">or</p>
                </div>
                <button className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
                  <Upload className="w-4 h-4" />
                  Select a file
                </button>
                <p className="text-xs text-gray-400">Choose from your device</p>
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 fade-in">
                {error}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                PDF files only
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                Max 50MB
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-emerald-500" />
                Private — processed in your browser
              </span>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFileInput}
            className="hidden"
          />
        </div>
      </section>

      {/* Tools */}
      <section id="tools" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900">All-in-one PDF toolkit</h2>
            <p className="mt-3 text-gray-600 max-w-2xl mx-auto">Every tool you need to work with PDF documents, in one place.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {TOOLS.map((tool) => (
              <div
                key={tool.name}
                className="group bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg hover:border-blue-200 transition-all duration-200 cursor-pointer"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${tool.color} group-hover:scale-110 transition-transform`}>
                  <tool.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">{tool.name}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{tool.desc}</p>
                <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  Try now <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900">Why JJ PDF Studio Pro?</h2>
            <p className="mt-3 text-gray-600 max-w-2xl mx-auto">Built for speed, privacy, and professional results.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((feat) => (
              <div key={feat.title} className="bg-white rounded-xl p-6 border border-gray-100 hover:shadow-md transition-shadow">
                <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center mb-4">
                  <feat.icon className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-2">{feat.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900">How it works</h2>
            <p className="mt-3 text-gray-600">Three simple steps to edit any PDF.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              { step: '01', icon: Upload, title: 'Upload your PDF', desc: 'Drag and drop or select a file from your device. No account needed.' },
              { step: '02', icon: Edit3, title: 'Edit and annotate', desc: 'Modify text, add images, highlight, draw, sign, and organize pages.' },
              { step: '03', icon: Check, title: 'Download your PDF', desc: 'Export your edited document as a standard PDF file, ready to share.' },
            ].map((item) => (
              <div key={item.step} className="text-center relative">
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-5 relative">
                  <item.icon className="w-7 h-7 text-blue-600" />
                  <span className="absolute -top-2 -right-2 w-7 h-7 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {item.step}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900">Simple, transparent pricing</h2>
            <p className="mt-3 text-gray-600">Start free. Upgrade when you need more.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PRICING.map((plan) => (
              <div
                key={plan.name}
                className={`bg-white rounded-2xl border p-7 relative ${
                  plan.highlight ? 'border-blue-600 shadow-xl ring-2 ring-blue-600/20' : 'border-gray-200 shadow-sm'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-full">
                    Most Popular
                  </div>
                )}
                <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
                  <span className="text-sm text-gray-500">/{plan.period}</span>
                </div>
                <ul className="mt-6 space-y-3">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-sm text-gray-600">
                      <Check className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      {feat}
                    </li>
                  ))}
                </ul>
                <button
                  className={`mt-7 w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    plan.highlight
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900">Frequently asked questions</h2>
            <p className="mt-3 text-gray-600">Everything you need to know about JJ PDF Studio Pro.</p>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm font-semibold text-gray-900">{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed fade-in">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-gradient-to-br from-blue-600 to-blue-700">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white">Ready to edit your PDF?</h2>
          <p className="mt-3 text-blue-100">No sign-up required. Just upload and start editing.</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-8 inline-flex items-center gap-2 px-6 py-3 bg-white text-blue-700 font-semibold rounded-lg hover:bg-blue-50 transition-colors shadow-lg"
          >
            <Upload className="w-5 h-5" />
            Upload your PDF
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <FileText className="w-4 h-4 text-white" />
                </div>
                <span className="text-lg font-bold text-white">JJ PDF Studio Pro</span>
              </div>
              <p className="text-sm leading-relaxed">The complete browser-based PDF editor. Fast, private, and powerful.</p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Tools</h4>
              <ul className="space-y-2 text-sm">
                {['Edit PDF', 'Merge PDF', 'Split PDF', 'Compress PDF', 'OCR'].map((t) => (
                  <li key={t}><a href="#tools" className="hover:text-white transition-colors">{t}</a></li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Company</h4>
              <ul className="space-y-2 text-sm">
                {['About', 'Blog', 'Privacy', 'Terms', 'Contact'].map((t) => (
                  <li key={t}><a href="#" className="hover:text-white transition-colors">{t}</a></li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Support</h4>
              <ul className="space-y-2 text-sm">
                {['Help Center', 'FAQ', 'Community', 'Report Issue'].map((t) => (
                  <li key={t}><a href="#faq" className="hover:text-white transition-colors">{t}</a></li>
                ))}
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-gray-500">© 2026 JJ PDF Studio Pro. All rights reserved.</p>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Shield className="w-3.5 h-3.5" />
              All processing happens in your browser
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
