'use client';

import { useEffect, useState } from 'react';
import { getWeatherForecast, type WeatherForecast } from '@/lib/api';

interface WeatherForecastCardProps {
  regionId: string;
}

export default function WeatherForecastCard({ regionId }: WeatherForecastCardProps) {
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadForecast();
  }, [regionId]);

  const loadForecast = async () => {
    if (!regionId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await getWeatherForecast(regionId);

      if (!response.success || !response.data) {
        setError('날씨 정보를 불러올 수 없습니다.');
        setLoading(false);
        return;
      }

      setForecast(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Error loading forecast:', err);
      setError('날씨 정보를 불러오는 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  const getSkyConditionText = (code?: number): string => {
    if (code === undefined) return '';
    switch (code) {
      case 1:
        return '☀️ 맑음';
      case 3:
        return '🌤️ 구름많음';
      case 4:
        return '☁️ 흐림';
      default:
        return '';
    }
  };

  const getPrecipitationTypeText = (code?: number): string => {
    if (code === undefined || code === 0) return '';
    switch (code) {
      case 1:
        return '🌧️ 비';
      case 2:
        return '🌨️ 비/눈';
      case 3:
        return '❄️ 눈';
      case 5:
        return '💧 빗방울';
      case 6:
        return '💧❄️ 빗방울/눈날림';
      case 7:
        return '❄️ 눈날림';
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-gray-600">날씨 정보 로딩 중...</p>
      </div>
    );
  }

  if (error || !forecast) {
    return null; // 에러 시 카드를 표시하지 않음
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-100 border border-blue-200 rounded-lg p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-800">
          {forecast.regionName} 현재 날씨
        </h3>
        <div className="text-xs text-gray-500 text-right">
          {forecast.baseTime && (
            <div>발표시간: {new Date(forecast.baseTime).toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit',
            })}</div>
          )}
          <div>{new Date(forecast.forecastTime).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
          })} 기준</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* 기온 */}
        {forecast.temperature !== undefined && (
          <div className="bg-white rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">기온</p>
            <p className="text-2xl font-bold text-blue-600">
              {forecast.temperature}°C
            </p>
            {forecast.feelsLike !== undefined && forecast.feelsLike !== forecast.temperature && (
              <p className="text-xs text-gray-600 mt-1">
                체감 {forecast.feelsLike}°C
              </p>
            )}
          </div>
        )}

        {/* 하늘상태 & 강수형태 */}
        <div className="bg-white rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">날씨</p>
          <p className="text-lg font-semibold">
            {getPrecipitationTypeText(forecast.precipitationType) ||
              getSkyConditionText(forecast.skyCondition)}
          </p>
        </div>

        {/* 강수확률 */}
        {forecast.precipitationProbability !== undefined && (
          <div className="bg-white rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">강수확률</p>
            <p className="text-2xl font-bold text-blue-600">
              {forecast.precipitationProbability}%
            </p>
          </div>
        )}

        {/* 습도 */}
        {forecast.humidity !== undefined && (
          <div className="bg-white rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">습도</p>
            <p className="text-2xl font-bold text-blue-600">
              {forecast.humidity}%
            </p>
          </div>
        )}

        {/* 풍속 */}
        {forecast.windSpeed !== undefined && (
          <div className="bg-white rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">풍속</p>
            <p className="text-2xl font-bold text-blue-600">
              {forecast.windSpeed.toFixed(1)} m/s
            </p>
          </div>
        )}

        {/* 최저/최고기온 */}
        {(forecast.minTemperature !== undefined || forecast.maxTemperature !== undefined) && (
          <div className="bg-white rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">최저/최고</p>
            <p className="text-lg font-semibold">
              {forecast.minTemperature !== undefined && `${forecast.minTemperature}°C`}
              {forecast.minTemperature !== undefined && forecast.maxTemperature !== undefined && ' / '}
              {forecast.maxTemperature !== undefined && `${forecast.maxTemperature}°C`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
