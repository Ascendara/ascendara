import React, { useState, useEffect, memo, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Label } from '../components/ui/label';
import { Progress } from '../components/ui/progress';
import { 
  Rocket, 
  Shield, 
  Download, 
  CheckCircle2, 
  PuzzleIcon,
  PackageOpen,
  Palette,
  Zap,
  Layout,
  CircleCheck,
  Loader,
  XCircle,
  Globe2,
  ExternalLink
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { useLanguage } from '../contexts/LanguageContext';
import { languages } from '../i18n';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';

const executableToLabelMap = {
  'dotNetFx40_Full_x86_x64.exe': t => '.NET Framework 4.0',
  'dxwebsetup.exe': t => 'DirectX',
  'oalinst.exe': t => 'OpenAL',
  'VC_redist.x64.exe': t => 'Visual C++ Redistributable',
  'xnafx40_redist.msi': t => 'XNA Framework',
};

const SUPPORTED_LANGUAGES = Object.entries(languages).map(([id, { name, nativeName }]) => ({
  id,
  name: nativeName,
  icon: getLanguageFlag(id)
}));

function getLanguageFlag(langId) {
  const flagMap = {
    'en': '🇺🇸',
    'es': '🇪🇸',
    'zh-CN': '🇨🇳',
    'ar': '🇸🇦',
    'hi': '🇮🇳',
    'bn': '🇧🇩',
    'pt': '🇵🇹',
    'ru': '🇷🇺',
    'ja': '🇯🇵'
  };
  return flagMap[langId] || '🌐';
}

const themes = [
  // Light themes
  { id: 'light', name: 'Arctic Sky', group: 'light' },
  { id: 'blue', name: 'Ocean Blue', group: 'light' },
  { id: 'purple', name: 'Ascendara Purple', group: 'light' },
  { id: 'emerald', name: 'Emerald', group: 'light' },
  { id: 'rose', name: 'Rose', group: 'light' },
  { id: 'amber', name: 'Amber Sand', group: 'light' },
  
  // Dark themes
  { id: 'dark', name: 'Dark Blue', group: 'dark' },
  { id: 'midnight', name: 'Midnight', group: 'dark' },
  { id: 'cyberpunk', name: 'Cyberpunk', group: 'dark' },
  { id: 'sunset', name: 'Sunset', group: 'dark' },
  { id: 'forest', name: 'Forest', group: 'dark' },
  { id: 'ocean', name: 'Deep Ocean', group: 'dark' },
];

const getThemeColors = (themeId) => {
  const themeMap = {
    light: {
      bg: 'bg-white',
      primary: 'bg-blue-500',
      secondary: 'bg-slate-100',
      text: 'text-slate-900'
    },
    dark: {
      bg: 'bg-slate-900',
      primary: 'bg-blue-500',
      secondary: 'bg-slate-800',
      text: 'text-slate-100'
    },
    blue: {
      bg: 'bg-blue-50',
      primary: 'bg-blue-600',
      secondary: 'bg-blue-100',
      text: 'text-blue-900'
    },
    purple: {
      bg: 'bg-purple-50',
      primary: 'bg-purple-500',
      secondary: 'bg-purple-100',
      text: 'text-purple-900'
    },
    emerald: {
      bg: 'bg-emerald-50',
      primary: 'bg-emerald-500',
      secondary: 'bg-emerald-100',
      text: 'text-emerald-900'
    },
    rose: {
      bg: 'bg-rose-50',
      primary: 'bg-rose-500',
      secondary: 'bg-rose-100',
      text: 'text-rose-900'
    },
    cyberpunk: {
      bg: 'bg-gray-900',
      primary: 'bg-pink-500',
      secondary: 'bg-gray-800',
      text: 'text-pink-500'
    },
    sunset: {
      bg: 'bg-slate-800',
      primary: 'bg-orange-500',
      secondary: 'bg-slate-700',
      text: 'text-orange-400'
    },
    forest: {
      bg: 'bg-[#141E1B]',
      primary: 'bg-green-500',
      secondary: 'bg-[#1C2623]',
      text: 'text-green-300'
    },
    ocean: {
      bg: 'bg-slate-900',
      primary: 'bg-blue-400',
      secondary: 'bg-slate-800',
      text: 'text-blue-300'
    },
    midnight: {
      bg: 'bg-[#0F172A]',
      primary: 'bg-indigo-500',
      secondary: 'bg-[#1E293B]',
      text: 'text-indigo-300'
    },
    amber: {
      bg: 'bg-amber-50',
      primary: 'bg-amber-500',
      secondary: 'bg-amber-100',
      text: 'text-amber-900'
    }
  };
  return themeMap[themeId] || themeMap.light;
};

function ThemeButton({ theme, currentTheme, onSelect }) {
  const colors = getThemeColors(theme.id);
  
  return (
    <button
      onClick={() => onSelect(theme.id)}
      className={`group relative overflow-hidden rounded-xl transition-all ${
        currentTheme === theme.id 
          ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' 
          : 'hover:ring-1 hover:ring-primary/50'
      }`}
    >
      <div className={`aspect-[4/3] ${colors.bg} border border-border`}>
        <div className="h-full p-4">
          <div className={`h-full rounded-lg ${colors.secondary} p-3 shadow-sm`}>
            <div className="space-y-2">
              <div className={`h-3 w-24 rounded-full ${colors.primary} opacity-80`} />
              <div className={`h-2 w-16 rounded-full ${colors.primary} opacity-40`} />
            </div>
            <div className="mt-4 space-y-2">
              <div className={`h-8 rounded-md ${colors.bg} bg-opacity-50`} />
              <div className={`h-8 rounded-md ${colors.bg} bg-opacity-30`} />
            </div>
          </div>
        </div>
      </div>
      
      <div className={`absolute bottom-0 left-0 right-0 p-3 
        ${colors.bg} bg-opacity-80 backdrop-blur-sm`}>
        <div className="flex items-center justify-between">
          <span className={`font-medium ${colors.text}`}>{theme.name}</span>
          <div className={`w-3 h-3 rounded-full ${colors.primary}`} />
        </div>
      </div>
    </button>
  );
}

const Welcome = ({ welcomeData, onComplete }) => {
  const { t } = useTranslation();
  const { language, changeLanguage } = useLanguage();
  const { setTheme } = useTheme();
  const [isV7Welcome, setIsV7Welcome] = useState(welcomeData.isV7Welcome);
  const [step, setStep] = useState('language');
  const [selectedTheme, setSelectedTheme] = useState('purple');
  const [showingLightThemes, setShowingLightThemes] = useState(true);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [showDepsAlert, setShowDepsAlert] = useState(false);
  const [showSkipAlert, setShowSkipAlert] = useState(false);
  const [showDepsErrorAlert, setShowDepsErrorAlert] = useState(false);
  const [downloadDirectory, setDownloadDirectory] = useState('');
  const [dependencyStatus, setDependencyStatus] = useState({
    '.NET Framework': { installed: false, icon: null },
    'DirectX': { installed: false, icon: null },
    'OpenAL': { installed: false, icon: null },
    'Visual C++': { installed: false, icon: null },
    'XNA Framework': { installed: false, icon: null },
  });
  const [warningMessage, setWarningMessage] = useState('');
  const [dependenciesInstalled, setDependenciesInstalled] = useState(false);
  const [progress, setProgress] = useState(0);
  const totalDependencies = 5; // Total number of dependencies
  const [errorMessage, setErrorMessage] = useState('');
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(true);
  const [isExiting, setIsExiting] = useState(false);
  const [showAnalyticsStep, setShowAnalyticsStep] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [settings, setSettings] = useState({
    downloadDirectory: '',
    viewOldDownloadLinks: false,
    seeInappropriateContent: false,
    autoCreateShortcuts: true,
    sendAnalytics: true,
    autoUpdate: true,
    language: 'en',
    theme: 'purple',
    threadCount: 4,
  });
  const [currentLangIndex, setCurrentLangIndex] = useState(0);

  const features = useMemo(() => [
    {
      icon: <Download className="w-5 h-5" />,
      title: t('welcome.automaticUpdatesTitle'),
      description: t('welcome.automaticUpdatesDesc')
    },
    {
      icon: <Shield className="w-5 h-5" />,
      title: t('welcome.securityPatchesTitle'),
      description: t('welcome.securityPatchesDesc')
    },
    {
      icon: <Zap className="w-5 h-5" />,
      title: t('welcome.bugFixesTitle'),
      description: t('welcome.bugFixesDesc')
    }
  ], [t]);

  const analyticsFeatures = useMemo(() => [
    {
      title: t('welcome.helpIdentifyAndFix'),
    },
    {
      title: t('welcome.influenceFutureFeatures'),
    },
    {
      title: t('welcome.bePartOfImproving'),
    }
  ], [t]);


  const v7Features = useMemo(() => [
    {
      icon: <Palette className="w-5 h-5" />,
      title: t('welcome.freshNewLookTitle'),
      description: t('welcome.freshNewLookDesc')
    },
    {
      icon: <Zap className="w-5 h-5" />,
      title: t('welcome.lightningFastTitle'),
      description: t('welcome.lightningFastDesc')
    },
    {
      icon: <Layout className="w-5 h-5" />,
      title: t('welcome.smartOrganizationTitle'),
      description: t('welcome.smartOrganizationDesc')
    },
    {
      icon: <PuzzleIcon className="w-5 h-5" />,
      title: t('welcome.improvedUXTitle'),
      description: t('welcome.improvedUXDesc')
    }
  ], [t]);

  const langPreferenceMessages = useMemo(() => [
    { text: "What's your preferred language?", lang: "en" },
    { text: "¿Cuál es tu idioma preferido?", lang: "es" },
    { text: "您喜欢使用哪种语言？", lang: "zh-CN" },
    { text: "ما هي لغتك المفضلة؟", lang: "ar" },
    { text: "आपकी पसंदीदा भाषा क्या है?", lang: "hi" },
    { text: "আপনার পছন্দের ভাষা কি?", lang: "bn" },
    { text: "Qual é a sua língua preferida?", lang: "pt" },
    { text: "Какой язык вы предпочитаете?", lang: "ru" }
  ], []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentLangIndex((prevIndex) => 
        prevIndex === langPreferenceMessages.length - 1 ? 0 : prevIndex + 1
      );
    }, 3000);

    return () => clearInterval(interval);
  }, [langPreferenceMessages.length]);

  useEffect(() => {
    if (welcomeData?.isV7Welcome !== undefined) {
      setIsV7Welcome(welcomeData.isV7Welcome);
    }
  }, [welcomeData?.isV7Welcome]);

  useEffect(() => {
    const handleDependencyStatus = (event, { name, status }) => {
      const label = executableToLabelMap[name](t);
      if (!label) return;

      console.log(`Received status for ${label}: ${status}`);

      if (status === 'starting') {
        console.log(`Starting installation of: ${label}`);
        setDependencyStatus(prevStatus => ({
            ...prevStatus,
            [label]: { installed: false, icon: <Loader className="w-5 h-5 animate-spin" /> },
        }));
      } else if (status === 'finished') {
        console.log(`Finished installing: ${label}`);
        setDependencyStatus(prevStatus => {
            const updatedStatus = {
                ...prevStatus,
                [label]: { installed: true, icon: <CircleCheck className="w-5 h-5 text-green-500" /> },
            };
            const allInstalled = Object.values(updatedStatus).every(dep => dep.installed);
            if (allInstalled) {
                setDependenciesInstalled(true);
            }
            console.log('Updated dependency status:', updatedStatus);
            return updatedStatus;
        });
      } else if (status === 'failed') {
        console.error(`Failed to install: ${label}`);
        setDependencyStatus(prevStatus => ({
            ...prevStatus,
            [label]: { installed: false, icon: <XCircle className="w-5 h-5 text-red-500" /> },
        }));
      }
    };

    window.electron.ipcRenderer.on('dependency-installation-status', handleDependencyStatus);

    return () => {
      window.electron.ipcRenderer.off('dependency-installation-status', handleDependencyStatus);
    };
  }, [t]);

  const handleNext = () => {
    if (step === 'language') {
      setStep('welcome');
    } else if (step === 'welcome') {
      setStep('directory');
    } else if (step === 'directory') {
      setStep('extension');
    } else if (step === 'extension') {
      setStep('theme');
    } else if (step === 'theme') {
      setStep('analytics');
    } else if (step === 'analytics') {
      setStep('updates');
    } else if (step === 'updates') {
      setStep('dependencies');
    } else if (step === 'dependencies') { 
      handleAnalyticsChoice(analyticsConsent);
      handleExit(true);
    }
  };

  const handleInstallDependencies = async () => {
    setIsInstalling(true);
    setProgress(0);
    
    // Set all dependencies to loading state
    setDependencyStatus(prevStatus => {
        const updatedStatus = { ...prevStatus };
        Object.keys(updatedStatus).forEach(dep => {
            updatedStatus[dep] = { installed: false, icon: <Loader className="w-5 h-5 animate-spin" /> };
        });
        return updatedStatus;
    });

    // Listen for dependency installation status
    const handleDependencyStatus = (event, { name, status }) => {
        const label = executableToLabelMap[name](t);
        if (!label) return;

        if (status === 'finished') {
            // Increment progress and set checkmark when installation finishes
            setProgress(prev => prev + 1);
            setDependencyStatus(prevStatus => {
                const updatedStatus = {
                    ...prevStatus,
                    [label]: { installed: true, icon: <CircleCheck className="w-5 h-5 text-green-500" /> },
                };

                // Check if all dependencies are installed after updating the status
                const allInstalled = Object.values(updatedStatus).every(dep => dep.installed);
                if (allInstalled) {
                    setIsInstalling(false); // Stop installation
                    setStep('installationComplete'); // Move to the installation complete step
                }

                return updatedStatus;
            });
        } else if (status === 'failed') {
            // Handle error
            setErrorMessage(`Failed to install ${label}. Please try again.`);
            setShowErrorDialog(true);
            setIsInstalling(false);
        }
    };

    window.electron.ipcRenderer.on('dependency-installation-status', handleDependencyStatus);
    await window.electron.installDependencies();
    window.electron.ipcRenderer.off('dependency-installation-status', handleDependencyStatus);

    setIsInstalling(false);
  };

  const handleRestart = () => {
    setShowErrorDialog(false);
    handleInstallDependencies();
  };

  const handleSkip = () => {
    setShowErrorDialog(false);
  };

  const handleSelectDirectory = async () => {
    const directory = await window.electron.openDirectoryDialog();
    const canCreateFiles = await window.electron.canCreateFiles(directory);
    if (!canCreateFiles) {
      setWarningMessage(t('welcome.cannotWriteWarning'));
      return;
    }
    if (directory) {
      setDownloadDirectory(directory);
      const { freeSpace } = await window.electron.getDriveSpace(directory);
      if (freeSpace < 40 * 1024 * 1024 * 1024) {
        setWarningMessage(t('welcome.notEnoughSpaceWarning'));
      } else {
        setWarningMessage('');
      }

      try {
        // Get current settings first
        const currentSettings = await window.electron.getSettings();
        
        // Update only the download directory while preserving others
        const updatedSettings = {
          ...currentSettings,
          downloadDirectory: directory
        };
        
        const result = await window.electron.saveSettings(updatedSettings, directory);
        
        if (!result) {
          console.error('Failed to save settings');
          setWarningMessage('Failed to save download directory. Please try again.');
        }
      } catch (error) {
        console.error('Error saving settings:', error);
        setWarningMessage('An error occurred while saving the download directory.');
      }
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.3 }
    },
    exit: {
      opacity: 0,
      transition: { duration: 0.2 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, ease: "easeOut" }
    }
  };

  const handleAnalyticsChoice = async (enableAnalytics) => {
    try {
      // Get current settings first
      const currentSettings = await window.electron.getSettings();
      
      // Update only the analytics setting while preserving others
      const updatedSettings = {
        ...currentSettings,
        sendAnalytics: enableAnalytics
      };
      
      // Save the updated settings with the current download directory
      await window.electron.saveSettings(
        updatedSettings,
        currentSettings.downloadDirectory || ''
      );
      
      setAnalyticsConsent(enableAnalytics);
      handleNext();
    } catch (error) {
      console.error('Error saving analytics preference:', error);
    }
  };

  const handleExit = async (showTour) => {
    setIsExiting(true);
    // Wait for animation to complete before calling onComplete
    await new Promise(resolve => setTimeout(resolve, 800)); 
    await window.electron.createTimestamp();
    onComplete(showTour);
  };

  const handleUpdateChoice = async (enableAutoUpdate) => {
    try {
      const currentSettings = await window.electron.getSettings();
      
      const updatedSettings = {
        ...currentSettings,
        autoUpdate: enableAutoUpdate
      };
      
      await window.electron.saveSettings(
        updatedSettings,
        currentSettings.downloadDirectory || ''
      );
      
      setAutoUpdate(enableAutoUpdate);
      handleNext();
    } catch (error) {
      console.error('Error saving auto-update preference:', error);
    }
  };

  const handleLanguageSelect = useCallback(async (value) => {
    try {
      changeLanguage(value);
      
      // Get current settings first
      const currentSettings = await window.electron.getSettings();
      const updatedSettings = {
        ...currentSettings,
        language: value
      };
      
      await window.electron.saveSettings(updatedSettings);
      setSettings(updatedSettings);
    } catch (error) {
      console.error('Error saving language preference:', error);
    }
  }, [changeLanguage]);

  const handleThemeSelect = async (themeId) => {
    try {
      setTheme(themeId);
      setSelectedTheme(themeId);
      
      // Get current settings first
      const currentSettings = await window.electron.getSettings();
      const updatedSettings = {
        ...currentSettings,
        theme: themeId
      };
      
      await window.electron.saveSettings(updatedSettings);
      setSettings(updatedSettings);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  if (welcomeData.isV7Welcome) {
    if (showAnalyticsStep) {
      return (
        <div className={`h-screen bg-background relative overflow-hidden flex items-center justify-center transition-opacity duration-500 ${isExiting ? 'opacity-0' : 'opacity-100'}`}>
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-background" />
          <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-primary/10 to-transparent" />
          
          <motion.div
            className="w-full max-w-4xl mx-auto px-6 relative z-10"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div 
              className="text-center mb-8"
              variants={itemVariants}
            >
              <h2 className="text-3xl font-bold mb-4">
                {t('welcome.helpImprove')}
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                {t('welcome.chooseHowToHelp')}
              </p>
            </motion.div>

            <motion.div 
              className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8"
              variants={itemVariants}
            >
              {/* Share Analytics Option */}
              <button
                onClick={() => setAnalyticsConsent(true)}
                className={`p-6 rounded-xl transition-all duration-200 ${
                  analyticsConsent 
                    ? 'bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-2 border-primary scale-105' 
                    : 'bg-card/30 border border-primary/10 hover:border-primary/30'
                }`}
              >
                <div className="flex items-center space-x-3 mb-4">
                  <div className={`p-2 rounded-lg ${analyticsConsent ? 'bg-primary/20' : 'bg-muted'}`}>
                    <Rocket className={`w-6 h-6 ${analyticsConsent ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <h3 className="text-xl font-semibold">{t('welcome.shareAndImprove')}</h3>
                </div>
                <ul className="space-y-3 text-left mb-6">
                  <li className="flex items-start space-x-2">
                    <CheckCircle2 className={`w-5 h-5 ${analyticsConsent ? 'text-primary' : 'text-muted-foreground'} shrink-0 mt-0.5`} />
                    <span>{t('welcome.helpIdentifyAndFix')}</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <CheckCircle2 className={`w-5 h-5 ${analyticsConsent ? 'text-primary' : 'text-muted-foreground'} shrink-0 mt-0.5`} />
                    <span>{t('welcome.influenceFutureFeatures')}</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <CheckCircle2 className={`w-5 h-5 ${analyticsConsent ? 'text-primary' : 'text-muted-foreground'} shrink-0 mt-0.5`} />
                    <span>{t('welcome.bePartOfImproving')}</span>
                  </li>
                </ul>
              </button>

              {/* Privacy Option */}
              <button
                onClick={() => setAnalyticsConsent(false)}
                className={`p-6 rounded-xl transition-all duration-200 ${
                  !analyticsConsent 
                    ? 'bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-2 border-primary scale-105' 
                    : 'bg-card/30 border border-primary/10 hover:border-primary/30'
                }`}
              >
                <div className="flex items-center space-x-3 mb-4">
                  <div className={`p-2 rounded-lg ${!analyticsConsent ? 'bg-primary/20' : 'bg-muted'}`}>
                    <Shield className={`w-6 h-6 ${!analyticsConsent ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <h3 className="text-xl font-semibold">{t('welcome.stayPrivate')}</h3>
                </div>
                <div className="space-y-4 text-left mb-6">
                  <p>{t('welcome.optOutOfSharing')}</p>
                  <div className="bg-card/30 p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      {t('welcome.ascendaraNeverCollects')}
                    </p>
                  </div>
                </div>
              </button>
            </motion.div>
            <motion.div 
              className="flex flex-col items-center justify-center"
              variants={itemVariants}
            >
              <Button
                size="lg"
                onClick={() => {
                  handleAnalyticsChoice(analyticsConsent);
                  handleExit(true);
                }}
                className="mb-4 px-12 py-6 text-lg font-semibold text-primary bg-primary/10 hover:bg-primary/20"
              >
                {t('welcome.seeWhatsNew')}
              </Button>
              <button
                onClick={() => {
                  handleAnalyticsChoice(analyticsConsent);
                  handleExit(false);
                }}
                className="text-sm text-foreground/60 hover:text-primary transition-colors"
              >
                {t('welcome.exploreOnMyOwn')}
              </button>
            </motion.div>
          </motion.div>
        </div>
      );
    }
    
    return (
      <div className={`h-screen bg-background relative overflow-hidden flex items-center justify-center transition-opacity duration-500 ${isExiting ? 'opacity-0' : 'opacity-100'}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-background" />
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-primary/10 to-transparent" />
        
        <motion.div
          className="w-full max-w-5xl mx-auto px-6 relative z-10"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div 
            className="text-center mb-8"
            variants={itemVariants}
          >
            <h1 className="text-6xl font-bold">
              <span className="text-4xl block mb-2 text-foreground/80">{t('welcome.sayHelloTo')}</span>
              <div className="relative inline-flex items-center">
                <span className="bg-gradient-to-r from-primary to-primary/50 bg-clip-text text-transparent">
                  Ascendara&nbsp;
                </span>
                <span className="relative">
                  <span className="animate-shine bg-[linear-gradient(110deg,var(--shine-from),45%,var(--shine-via),55%,var(--shine-to))] bg-[length:200%_100%] inline-block bg-clip-text text-transparent">
                    v7
                  </span>
                </span>
              </div>
            </h1>
          </motion.div>

          <motion.p 
            className="text-xl mb-10 max-w-2xl mx-auto text-center text-foreground/80"
            variants={itemVariants}
          >
            {t('welcome.yourContinuedSupport')}
          </motion.p>

          <motion.div 
            className="grid grid-cols-2 gap-6 mb-10"
            variants={itemVariants}
          >
            {v7Features.map((feature) => (
              <div 
                key={feature.title}
                className="p-5 rounded-xl bg-card/30 backdrop-blur-sm border border-primary/10 hover:bg-card/40 transition-colors"
              >
                <div className="flex items-center space-x-3 mb-3">
                  <div className="text-primary bg-primary/10 p-2 rounded-lg">{feature.icon}</div>
                  <h3 className="text-lg font-semibold">{feature.title}</h3>
                </div>
                <p className="text-foreground/70">{feature.description}</p>
              </div>
            ))}
          </motion.div>

          <motion.p 
            className="text-center text-foreground/70 text-sm mb-8"
            variants={itemVariants}
          >
            {t('welcome.everyUpdateIsInspired')}
          </motion.p>

          <motion.div 
            className="flex flex-col items-center space-y-4 text-secondary"
            variants={itemVariants}
          >
            <Button
              size="lg"
              onClick={() => setShowAnalyticsStep(true)}
              className="px-8 py-6 text-lg font-semibold bg-primary hover:bg-primary/90"
            >
              {t('welcome.continue')}
            </Button>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`transition-opacity duration-500 ${isExiting ? 'opacity-0' : 'opacity-100'}`}>
      <AlertDialog open={showDepsAlert} onOpenChange={setShowDepsAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">{t('welcome.installDependencies')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('welcome.youWillReceiveAdminPrompts')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-primary">{t('welcome.cancel')}</AlertDialogCancel>
            <AlertDialogAction className="text-secondary bg-primary" onClick={handleInstallDependencies}>{t('welcome.continue')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showSkipAlert} onOpenChange={setShowSkipAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">{t('welcome.skipDependencies')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('welcome.areYouSureYouWantToSkip')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-primary" >{t('welcome.cancel')}</AlertDialogCancel>
            <AlertDialogAction className="text-secondary bg-primary" onClick={async () => {
                setShowSkipAlert(false);
                handleExit(true);
              }}
            >
              {t('welcome.continue')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDepsErrorAlert} onOpenChange={setShowDepsErrorAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">{t('welcome.installationFailed')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('welcome.failedToInstallDependencies')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="text-secondary bg-primary" onClick={() => setShowDepsErrorAlert(false)}>
              {t('welcome.okay')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">{t('welcome.errorInstallingDependencies')}</AlertDialogTitle>
            <AlertDialogDescription>
              {errorMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-primary" onClick={handleSkip}>{t('welcome.skip')}</AlertDialogCancel>
            <AlertDialogAction className="text-secondary bg-primary" onClick={handleRestart}>{t('welcome.restart')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="min-h-screen bg-background relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-background" />
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-primary/10 to-transparent" />
        
        <AnimatePresence mode="wait">
          {step === 'welcome' && (
            <motion.div
              key="welcome"
              className="min-h-screen flex flex-col items-center justify-center p-8 text-center relative z-10"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.div className="flex items-center justify-center mb-8" variants={itemVariants}>
                <h1 className="text-6xl font-bold">
                  <div className="relative inline-flex items-center">
                    <span className="bg-gradient-to-r from-primary to-primary/50 bg-clip-text text-transparent">
                      {t('welcome.welcomeTo')}&nbsp;
                    </span>
                    <span className="relative">
                      <span className="animate-shine bg-[linear-gradient(110deg,var(--shine-from),45%,var(--shine-via),55%,var(--shine-to))] bg-[length:200%_100%] inline-block bg-clip-text text-transparent">
                        {t('welcome.ascendara')}
                      </span>
                    </span>
                  </div>
                </h1>
              </motion.div>
              <motion.p 
                className="text-xl mb-12 max-w-3xl text-foreground/80"
                variants={itemVariants}
              >
                {t('welcome.welcomeToAscendaraDescription')}
              </motion.p>

              <motion.div 
                className="space-y-6 mb-12 max-w-xl"
                variants={itemVariants}
              >
                <div>
                  <div className="flex items-center space-x-3 p-4 rounded-lg hover:bg-card/50 transition-colors">
                    <Checkbox 
                      id="privacy" 
                      checked={privacyChecked}
                      onCheckedChange={setPrivacyChecked}
                      className="data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                    />
                    <div className="text-base">
                      <Label htmlFor="privacy" className="inline cursor-pointer">
                        {t('welcome.iHaveReadAndAgreeTo')}{' '}
                      </Label>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          window.electron.openURL('https://ascendara.app/privacy');
                        }}
                        className="text-primary hover:underline inline"
                      >
                        {t('welcome.privacyPolicy')}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 p-4 rounded-lg hover:bg-card/50 transition-colors">
                    <Checkbox 
                      id="terms" 
                      checked={termsChecked}
                      onCheckedChange={setTermsChecked}
                      className="data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                    />
                    <div className="text-base">
                      <Label htmlFor="terms" className="inline cursor-pointer">
                        {t('welcome.iHaveReadAndAgreeTo')}{' '}
                      </Label>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          window.electron.openURL('https://ascendara.app/terms');
                        }}
                        className="text-primary hover:underline inline"
                      >
                        {t('welcome.termsOfService')}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div variants={itemVariants}>
                <Button
                  size="lg"
                  onClick={handleNext}
                  disabled={!privacyChecked || !termsChecked}
                  className="px-8 py-6 text-lg font-semibold text-secondary"
                >
                  {t('welcome.getStarted')}
                </Button>
              </motion.div>
            </motion.div>
          )}

          {step === 'language' && (
            <motion.div
              key="language"
              className="min-h-screen flex flex-col items-center justify-center p-8 text-center relative z-10 bg-gradient-to-b from-background to-background/80"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.div 
                className="text-center mb-12"
                variants={itemVariants}
              >
                <Globe2 className="w-16 h-16 mx-auto mb-6 text-primary animate-pulse" />
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={currentLangIndex}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.5 }}
                      className="text-4xl block mb-2 text-foreground/80"
                    >
                      {langPreferenceMessages[currentLangIndex].text}
                    </motion.span>
                  </AnimatePresence>
                </h1>
              </motion.div>
              
              <motion.div 
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12 max-w-5xl w-full"
                variants={itemVariants}
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <motion.button
                    key={lang.id}
                    onClick={() => handleLanguageSelect(lang.id)}
                    className={`p-6 rounded-2xl transition-all duration-300 flex items-center space-x-4 ${
                      language === lang.id
                        ? 'bg-gradient-to-br from-primary/15 via-primary/10 to-transparent border-2 border-primary scale-105 shadow-lg shadow-primary/10'
                        : 'bg-card/40 border border-primary/10 hover:border-primary/30 hover:bg-card/60 hover:scale-102'
                    }`}
                    whileHover={{ scale: language === lang.id ? 1.05 : 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="text-3xl">{lang.icon}</div>
                    <span className="text-xl font-medium">{lang.name}</span>
                  </motion.button>
                ))}
              </motion.div>

              <motion.div className="flex justify-center" variants={itemVariants}>
                <Button 
                  size="lg"
                  className="w-full bg-primary hover:bg-primary/90 text-secondary"
                  onClick={handleNext}
                  disabled={!language}
                >
                  {t('welcome.next')}
                </Button>
              </motion.div>

              <motion.p 
                className="text-sm text-muted-foreground mt-6"
                variants={itemVariants}
              >
                {t('welcome.youCanChangeThisLater')}
              </motion.p>
            </motion.div>
          )}

          {step === 'directory' && (
            <motion.div
              key="directory"
              className="min-h-screen flex flex-col items-center justify-center p-8 text-center relative z-10"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.div 
                className="text-center mb-8"
                variants={itemVariants}
              >
                <h2 className="text-3xl font-bold mb-2 text-primary">{t('welcome.chooseDownloadLocation')}</h2>
                <p className="text-lg text-muted-foreground">{t('welcome.selectWhereYouWantYourGamesToBeDownloaded')}</p>
              </motion.div>
              <motion.div 
                className="space-y-6 mb-12 max-w-2xl bg-card/30 p-6 rounded-lg"
                variants={itemVariants}
              >
                <div className="flex items-center space-x-4">
                  <input
                    type="text"
                    value={downloadDirectory}
                    readOnly
                    placeholder={t('welcome.selectADirectory')}
                    className="flex-1 bg-background/50 border border-primary/10 rounded-lg px-4 py-2 text-primary-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  />
                  <Button className="text-secondary" onClick={handleSelectDirectory}>
                    {t('welcome.browse')}
                  </Button>
                </div>

                {warningMessage && (
                  <p className="text-red-500 text-sm">{warningMessage}</p>
                )}

                <div className="text-left space-y-4 mt-6">
                  <div className="flex items-start space-x-3">
                    <PackageOpen className="w-5 h-5 text-primary mt-1" />
                    <p>{t('welcome.thisIsWhereAllYourDownloadedGamesWillBeStored')}</p>
                  </div>
                  <div className="flex items-start space-x-3">
                    <Shield className="w-5 h-5 text-primary mt-1" />
                    <p>{t('welcome.makeSureYouHaveEnoughDiskSpaceInTheSelectedLocation')}</p>
                  </div>
                </div>
              </motion.div>

              <motion.div variants={itemVariants}>
                <Button
                  size="lg"
                  onClick={handleNext}
                  disabled={!downloadDirectory}
                  className="px-8 py-6 text-lg font-semibold bg-primary hover:bg-primary/90 text-secondary"
                >
                  {t('welcome.continue')}
                </Button>
              </motion.div>
            </motion.div>
          )}

          {step === 'extension' && (
            <motion.div
              key="extension"
              className="min-h-screen flex flex-col items-center justify-center p-8 text-center relative z-10"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.div className="flex items-center justify-center mb-8" variants={itemVariants}>
                <h2 className="text-4xl font-bold text-primary">{t('welcome.downloadGamesFaster')}</h2>
              </motion.div>
              <motion.p 
                className="text-xl mb-8 max-w-2xl text-foreground/80"
                variants={itemVariants}
              >
                {t('welcome.getTheAscendaraDownloadHandlerExtension')}
              </motion.p>

              <motion.div 
                className="space-y-6 mb-12 max-w-2xl bg-card/30 p-6 rounded-lg"
                variants={itemVariants}
              >
                <h3 className="text-lg font-semibold mb-4">{t('welcome.howItWorks')}</h3>
                <div className="space-y-4 text-left">
                  <div className="flex items-start space-x-3">
                    <span className="text-primary font-semibold">1.</span>
                    <p>{t('welcome.clickTheExtensionIcon')}</p>
                  </div>
                  <div className="flex items-start space-x-3">
                    <span className="text-primary font-semibold">2.</span>
                    <p>{t('welcome.whenYouClickADownloadLink')}</p>
                  </div>
                  <div className="flex items-start space-x-3">
                    <span className="text-primary font-semibold">3.</span>
                    <p>{t('welcome.startTheDownload')}</p>
                  </div>
                </div>

                <div className="mt-8 p-4 bg-primary/5 rounded-md">
                  <p className="text-sm text-foreground/70">
                    {t('welcome.theExtensionBlocksKnownProviders')}
                  </p>
                </div>
              </motion.div>

              <motion.div 
                className="flex justify-center space-x-4"
                variants={itemVariants}
              >
                <Button
                  size="lg"
                  onClick={() => window.electron.openURL('https://ascendara.app/extension')}
                  className="px-8 py-6 text-lg font-semibold bg-primary hover:bg-primary/90 text-secondary"
                >
                  {t('welcome.getTheExtension')}
                </Button>
                <Button 
                  variant="outline"
                  onClick={handleNext}
                  size="lg"
                  className="px-8 py-6 text-lg font-semibold hover:bg-primary/10 text-primary"
                >
                  {t('welcome.continue')}
                </Button>
              </motion.div>
            </motion.div>
          )}

          {step === 'theme' && (
            <div className="min-h-screen bg-background relative overflow-y-auto flex items-center justify-center py-8">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-background" />
              <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-primary/10 to-transparent" />
              
              <motion.div
                className="w-full max-w-4xl mx-auto px-6 relative z-10 py-4"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                <motion.div 
                  className="text-center mb-8"
                  variants={itemVariants}
                >
                  <h2 className="text-3xl font-bold mb-4 text-primary">
                    {t('welcome.chooseYourTheme')}
                  </h2>
                  <p className="text-lg text-muted-foreground mb-8">
                    {t('welcome.personalizeYourExperience')}
                  </p>
                </motion.div>

                <motion.div className="flex justify-center mb-6" variants={itemVariants}>
                  <div className="bg-card/30 p-1 rounded-lg inline-flex">
                    <button
                      onClick={() => setShowingLightThemes(true)}
                      className={`px-4 py-2 rounded-md transition-all ${
                        showingLightThemes 
                          ? 'bg-primary text-secondary' 
                          : 'hover:bg-primary/10'
                      }`}
                    >
                      {t('welcome.lightThemes')}
                    </button>
                    <button
                      onClick={() => setShowingLightThemes(false)}
                      className={`px-4 py-2 rounded-md transition-all ${
                        !showingLightThemes 
                          ? 'bg-primary text-secondary' 
                          : 'hover:bg-primary/10'
                      }`}
                    >
                      {t('welcome.darkThemes')}
                    </button>
                  </div>
                </motion.div>

                <motion.div 
                  className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8"
                  variants={itemVariants}
                >
                  {themes
                    .filter(theme => theme.group === (showingLightThemes ? 'light' : 'dark'))
                    .map((theme) => (
                      <ThemeButton
                        key={theme.id}
                        theme={theme}
                        currentTheme={selectedTheme}
                        onSelect={handleThemeSelect}
                      />
                  ))}
                </motion.div>

                <motion.div 
                  className="flex justify-center"
                  variants={itemVariants}
                >
                  <Button
                    size="lg"
                    onClick={handleNext}
                    className="px-8 py-6 text-lg bg-primary hover:bg-primary/90 text-secondary"
                  >
                    {t('welcome.continue')}
                  </Button>
                </motion.div>
              </motion.div>
            </div>
          )}

          {step === 'analytics' && (
            <motion.div
              key="analytics"
              className="min-h-screen flex flex-col items-center justify-center p-8 text-center relative z-10"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.div 
                className="text-center mb-8"
                variants={itemVariants}
              >
                <h2 className="text-3xl font-bold mb-2 text-primary">{t('welcome.analytics')}</h2>
                <p className="text-lg text-muted-foreground">{t('welcome.analyticsDesc')}</p>
              </motion.div>

              <motion.div 
                className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12 max-w-4xl w-full"
                variants={itemVariants}
              >
                {/* Share Analytics Option */}
                <div className="p-6 rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 hover:border-primary/30 transition-colors">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2 rounded-lg bg-primary/20">
                      <Rocket className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold text-primary">{t('welcome.shareAndImprove')}</h3>
                  </div>
                  <div className="space-y-4 mb-6">
                    {analyticsFeatures.map((feature) => (
                      <div key={feature.title} className="flex items-start space-x-2">
                        <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div className="text-left">
                          <p className="font-medium text-muted-foreground">{feature.title}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    size="lg"
                    className="w-full bg-primary hover:bg-primary/90 text-secondary"
                    onClick={() => handleAnalyticsChoice(true)}
                  >
                    {t('welcome.shareAnonymousData')}
                  </Button>
                </div>

                {/* Privacy Option */}
                <div className="p-6 rounded-xl bg-card/30 border border-border flex flex-col">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2 rounded-lg bg-muted">
                      <Shield className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-semibold text-muted-foreground">{t('welcome.stayPrivate')}</h3>
                  </div>
                  <p className="text-muted-foreground mb-6 text-left">
                    {t('welcome.optOutOfSharingAnonymousUsageData')}
                  </p>
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full text-muted-foreground mt-auto"
                    onClick={() => handleAnalyticsChoice(false)}
                  >
                    {t('welcome.continueWithoutSharing')}
                  </Button>
                </div>
              </motion.div>

              <motion.p 
                className="text-sm text-muted-foreground max-w-2xl"
                variants={itemVariants}
              >
                {t('welcome.ascendaraNeverCollectsPersonalInfo')} &nbsp;
                <span className="text-primary hover:underline cursor-pointer" onClick={() => window.electron.openURL('https://ascendara.app/analytics')}>{t('common.learnMore')} <ExternalLink className="inline-block mb-1 h-3 w-3" /></span>
              </motion.p>
            </motion.div>
          )}

          {step === 'updates' && (
            <motion.div
              key="updates"
              className="min-h-screen flex flex-col items-center justify-center p-8 text-center relative z-10"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.div className="flex items-center justify-center mb-8" variants={itemVariants}>
                <h2 className="text-4xl font-bold text-primary">{t('welcome.stayUpToDate')}</h2>
              </motion.div>
              <motion.p 
                className="text-xl mb-8 max-w-2xl text-foreground/80"
                variants={itemVariants}
              >
                {t('welcome.chooseHowYouWantToReceiveUpdates')}
              </motion.p>

              <motion.div 
                className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12 max-w-4xl w-full"
                variants={itemVariants}
              >
                {/* Auto Update Option */}
                <div className="p-6 rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 hover:border-primary/30 transition-colors">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2 rounded-lg bg-primary/20">
                      <Download className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold text-primary">{t('welcome.automaticUpdates')}</h3>
                  </div>
                  <div className="space-y-4 mb-6">
                    {features.map((feature) => (
                      <div key={feature.title} className="flex items-start space-x-2">
                        <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div className="text-left">
                          <p className="font-medium text-primary">{feature.title}</p>
                          <p className="text-sm text-foreground/70">{feature.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    size="lg"
                    className="w-full bg-primary hover:bg-primary/90 text-secondary"
                    onClick={() => handleUpdateChoice(true)}
                  >
                    {t('welcome.enableAutoUpdates')}
                  </Button>
                </div>

                {/* Manual Update Option */}
                <div className="p-6 rounded-xl bg-card/30 border border-border flex flex-col">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2 rounded-lg bg-muted">
                      <Shield className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-semibold text-muted-foreground">{t('welcome.manualUpdates')}</h3>
                  </div>
                  <p className="text-muted-foreground mb-6 text-left">
                    {t('welcome.chooseWhenToUpdateAscendaraYourself')}
                  </p>
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full text-muted-foreground mt-auto"
                    onClick={() => handleUpdateChoice(false)}
                  >
                    {t('welcome.neverAutomaticallyUpdate')}
                  </Button>
                </div>
              </motion.div>

              <motion.p 
                className="text-sm text-muted-foreground max-w-2xl"
                variants={itemVariants}
              >
                {t('welcome.youCanChangeThisSettingLater')}
              </motion.p>
            </motion.div>
          )}

          {step === 'dependencies' && (
            <motion.div
              key="dependencies"
              className="min-h-screen flex flex-col items-center justify-center p-8 text-center relative z-10"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.div className="flex items-center justify-center mb-8" variants={itemVariants}>
                <h2 className="text-4xl font-bold text-primary">{t('welcome.essentialDependencies')}</h2>
              </motion.div>
              <motion.div 
                className="space-y-6 mb-12 max-w-2xl"
                variants={itemVariants}
              >
                <p className="text-xl text-foreground/80">
                  {t('welcome.dependenciesDesc')}
                </p>
                <div className="grid grid-cols-2 gap-4 text-left text-muted-foreground">
                  {[
                    { name: '.NET Framework', desc: t('welcome.requiredForModernGames') },
                    { name: 'DirectX', desc: t('welcome.graphicsAndMultimedia') },
                    { name: 'OpenAL', desc: t('welcome.audioProcessing') },
                    { name: 'Visual C++', desc: t('welcome.runtimeComponents') },
                    { name: 'XNA Framework', desc: t('welcome.gameDevelopmentFramework') }
                  ].map((dep) => (
                    <div key={dep.name} className="flex items-start space-x-3 p-4">
                      {dependencyStatus[dep.name].icon}
                      <div>
                        <button
                          type="button"
                          onClick={() => window.electron.openURL(dep.url)}
                          className="font-medium hover:text-primary transition-colors"
                        >
                          {dep.name}
                        </button>
                        <p className="text-sm text-foreground/60">{dep.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>

              {isInstalling ? (
                <motion.div 
                  className="space-y-4 w-full max-w-md"
                  variants={itemVariants}
                >
                  <p className="text-lg text-foreground/80">{t('welcome.installingDependencies')} {progress}/{totalDependencies}</p>
                  <p className="text-sm text-foreground/60">
                    {t('welcome.pleaseWaitAndRespondToAdminPrompts')}
                  </p>
                  <Progress value={(progress / totalDependencies) * 100} className="h-2" />
                </motion.div>
              ) : (
                <motion.div 
                  className="flex justify-center space-x-4"
                  variants={itemVariants}
                >
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => setShowDepsAlert(true)}
                    className="px-8 py-6 text-muted-foreground hover:text-primary transition-colors"
                  >
                    {t('welcome.installDependencies')}
                  </Button>

                  <div className="flex flex-col items-center space-y-4">
                    <Button 
                      onClick={() => handleExit(true)}
                      size="lg"
                      className="px-8 py-6"
                    >
                      <Rocket className="mr-2 h-5 w-5 text-secondary" />
                      <span className="text-secondary"> {t('welcome.iHaveTheseTakeMeToTheTour')}</span>
                     
                    </Button>
                    
                    <button
                      onClick={() => handleExit(false)}
                      className="text-sm text-foreground/60 hover:text-primary transition-colors"
                    >
                      {t('welcome.skipTheTour')}
                    </button>
                  </div>

                </motion.div>
              )}
            </motion.div>
          )}
          {step === 'installationComplete' && (
            <motion.div
              key="installationComplete"
              className="min-h-screen flex flex-col items-center justify-center p-8 text-center relative z-10"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.div className="flex items-center justify-center mb-8" variants={itemVariants}>
                <h2 className="text-4xl font-bold text-primary">{t('welcome.dependenciesInstalled')}</h2>
              </motion.div>
              <motion.p 
                className="text-xl mb-8 max-w-2xl text-foreground/80"
                variants={itemVariants}
              >
                {t('welcome.allRequiredDependenciesHaveBeenInstalled')}
              </motion.p>

              <motion.div className="flex justify-center space-x-4" variants={itemVariants}>
                <Button 
                  onClick={() => handleExit(true)}
                  size="lg"
                  className="px-8 py-6"
                >
                  <Rocket className="mr-2 h-5 w-5" />
                  {t('welcome.takeTheTour')}
                </Button>
                <button
                  onClick={() => handleExit(false)}
                  className="text-sm text-foreground/60 hover:text-primary transition-colors"
                >
                  {t('welcome.skipTour')}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Welcome; 