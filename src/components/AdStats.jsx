import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { 
  BarChart, 
  Eye, 
  MousePointerClick, 
  TrendingUp, 
  Loader2,
  RefreshCw 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAuthToken } from "@/utils/authHelper";
import { useLanguage } from "@/context/LanguageContext";

const AdStats = ({ userId }) => {
  const { t } = useLanguage();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = async () => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const token = await getAuthToken();
      const response = await fetch(`https://api.ascendara.app/ads/stats/${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      
      if (data.success) {
        // Process adImage paths on client side if needed
        if (data.stats.ads) {
          data.stats.ads = data.stats.ads.map(ad => {
            if (ad.adImage && ad.adImage.startsWith('./')) {
              const filename = ad.adImage.substring(2);
              ad.adImage = `https://api.ascendara.app/ads/image/${filename}`;
            }
            return ad;
          });
        }
        
        setStats(data.stats);
      } else {
        setError(t('ascend.adStats.error'));
      }
    } catch (err) {
      console.error('Error fetching ad stats:', err);
      setError(t('ascend.adStats.error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!stats || stats.totalAds === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <BarChart className="mb-4 h-12 w-12 text-muted-foreground" />
        <h3 className="mb-2 text-lg font-semibold">{t('ascend.adStats.noAds')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('ascend.adStats.noAdsDescription')}
        </p>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('ascend.adStats.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('ascend.adStats.subtitle')}</p>
        </div>
        <Button onClick={fetchStats} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('ascend.adStats.refresh')}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-purple-500/10 p-3">
              <BarChart className="h-6 w-6 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('ascend.adStats.totalAds')}</p>
              <p className="text-2xl font-bold">{stats.totalAds}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-blue-500/10 p-3">
              <Eye className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('ascend.adStats.totalViews')}</p>
              <p className="text-2xl font-bold">{stats.totalViews.toLocaleString()}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-green-500/10 p-3">
              <MousePointerClick className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('ascend.adStats.totalClicks')}</p>
              <p className="text-2xl font-bold">{stats.totalClicks.toLocaleString()}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-amber-500/10 p-3">
              <TrendingUp className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('ascend.adStats.clickRate')}</p>
              <p className="text-2xl font-bold">{stats.ctr}%</p>
            </div>
          </div>
        </Card>
      </div>

      {stats.ads && stats.ads.length > 0 && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold">{t('ascend.adStats.yourAds')}</h3>
          <div className="grid gap-6">
            {stats.ads.map((ad) => {
              const getExpirationStatus = () => {
                if (!ad.expires) return null;
                
                const expiresDate = new Date(ad.expires);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                expiresDate.setHours(0, 0, 0, 0);
                
                const daysUntilExpiry = Math.ceil((expiresDate - today) / (1000 * 60 * 60 * 24));
                
                if (daysUntilExpiry < 0) {
                  return { status: 'expired', days: daysUntilExpiry, color: 'text-destructive' };
                } else if (daysUntilExpiry <= 7) {
                  return { status: 'expiring-soon', days: daysUntilExpiry, color: 'text-amber-500' };
                } else {
                  return { status: 'active', days: daysUntilExpiry, color: 'text-muted-foreground' };
                }
              };
              
              const expirationStatus = getExpirationStatus();
              
              return (
                <Card key={ad.id} className="overflow-hidden">
                  <div className="grid gap-6 md:grid-cols-[300px_1fr] lg:grid-cols-[400px_1fr]">
                    {ad.adImage && (
                      <div className="relative h-48 overflow-hidden bg-muted md:h-full">
                        <img
                          src={ad.adImage}
                          alt={`Ad ${ad.id}`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-6 p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h4 className="text-xl font-bold">{t('ascend.adStats.ad')} #{ad.id}</h4>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {t('ascend.adStats.activeAdvertisement')}
                          </p>
                          {ad.expires && (
                            <div className="mt-3">
                              <p className={`text-sm font-medium ${expirationStatus?.color}`}>
                                {expirationStatus?.status === 'expired' && (
                                  <span>{t('ascend.adStats.expired')}</span>
                                )}
                                {expirationStatus?.status === 'expiring-soon' && (
                                  <span>
                                    {t('ascend.adStats.expiringSoon')} - {t('ascend.adStats.expiresOn', { date: new Date(ad.expires).toLocaleDateString() })}
                                  </span>
                                )}
                                {expirationStatus?.status === 'active' && (
                                  <span>{t('ascend.adStats.expiresOn', { date: new Date(ad.expires).toLocaleDateString() })}</span>
                                )}
                              </p>
                              {(expirationStatus?.status === 'expired' || expirationStatus?.status === 'expiring-soon') && (
                                <p className="mt-2 text-sm font-medium text-purple-500">
                                  {t('ascend.adStats.contactSupport')}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4">
                        <Card className="border-blue-500/20 bg-blue-500/5 p-4">
                          <div className="flex flex-col items-center text-center">
                            <Eye className="mb-2 h-8 w-8 text-blue-500" />
                            <p className="text-2xl font-bold text-blue-500">{ad.views.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">{t('ascend.adStats.views')}</p>
                          </div>
                        </Card>
                        <Card className="border-green-500/20 bg-green-500/5 p-4">
                          <div className="flex flex-col items-center text-center">
                            <MousePointerClick className="mb-2 h-8 w-8 text-green-500" />
                            <p className="text-2xl font-bold text-green-500">{ad.clicks.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">{t('ascend.adStats.clicks')}</p>
                          </div>
                        </Card>
                        <Card className="border-amber-500/20 bg-amber-500/5 p-4">
                          <div className="flex flex-col items-center text-center">
                            <TrendingUp className="mb-2 h-8 w-8 text-amber-500" />
                            <p className="text-2xl font-bold text-amber-500">
                              {ad.views > 0 ? ((ad.clicks / ad.views) * 100).toFixed(2) : 0}%
                            </p>
                            <p className="text-xs text-muted-foreground">{t('ascend.adStats.ctr')}</p>
                          </div>
                        </Card>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {(!stats.ads || stats.ads.length === 0) && (
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <div className="rounded-full bg-muted p-4">
              <BarChart className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">No Ads Yet</h3>
              <p className="text-sm text-muted-foreground">
                You don't have any active advertisements at the moment.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default AdStats;
