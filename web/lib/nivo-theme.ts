/**
 * Nivo 차트 공통 테마 설정
 */

// Nivo Theme 타입 (간소화 버전)
type Theme = {
  background?: string;
  text?: {
    fontSize?: number;
    fill?: string;
    fontFamily?: string;
  };
  tooltip?: {
    container?: Record<string, any>;
    basic?: Record<string, any>;
  };
  labels?: {
    text?: Record<string, any>;
  };
  legends?: {
    text?: Record<string, any>;
    title?: {
      text?: Record<string, any>;
    };
  };
  grid?: {
    line?: Record<string, any>;
  };
  axis?: {
    domain?: {
      line?: Record<string, any>;
    };
    ticks?: {
      line?: Record<string, any>;
      text?: Record<string, any>;
    };
    legend?: {
      text?: Record<string, any>;
    };
  };
};

export const nivoTheme: Theme = {
  background: 'transparent',
  text: {
    fontSize: 12,
    fill: '#1e293b',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  },
  tooltip: {
    container: {
      background: '#0f172a',
      color: '#f8fafc',
      fontSize: 13,
      borderRadius: 8,
      padding: '12px 16px',
      boxShadow: '0 10px 25px rgba(15, 23, 42, 0.4)',
    },
    basic: {
      whiteSpace: 'pre-wrap',
      display: 'flex',
      alignItems: 'center',
    },
  },
  labels: {
    text: {
      fontSize: 12,
      fill: '#1e293b',
      fontWeight: 700,
    },
  },
  legends: {
    text: {
      fontSize: 12,
      fill: '#334155',
      fontWeight: 500,
    },
    title: {
      text: {
        fontSize: 13,
        fill: '#1e293b',
        fontWeight: 600,
      },
    },
  },
  grid: {
    line: {
      stroke: '#e2e8f0',
      strokeWidth: 1,
    },
  },
  axis: {
    domain: {
      line: {
        stroke: '#cbd5e1',
        strokeWidth: 1,
      },
    },
    ticks: {
      line: {
        stroke: '#cbd5e1',
        strokeWidth: 1,
      },
      text: {
        fontSize: 11,
        fill: '#64748b',
      },
    },
    legend: {
      text: {
        fontSize: 12,
        fill: '#475569',
        fontWeight: 600,
      },
    },
  },
};

// 다크 모드 테마 (선택사항)
export const nivoDarkTheme: Theme = {
  ...nivoTheme,
  text: {
    ...nivoTheme.text,
    fill: '#e2e8f0',
  },
  tooltip: {
    container: {
      background: '#1e293b',
      color: '#f8fafc',
      fontSize: 13,
      borderRadius: 8,
      padding: '12px 16px',
      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.6)',
    },
  },
  labels: {
    text: {
      fontSize: 11,
      fill: '#cbd5e1',
      fontWeight: 600,
    },
  },
  legends: {
    text: {
      fontSize: 12,
      fill: '#cbd5e1',
      fontWeight: 500,
    },
  },
  grid: {
    line: {
      stroke: '#334155',
      strokeWidth: 1,
    },
  },
  axis: {
    domain: {
      line: {
        stroke: '#475569',
        strokeWidth: 1,
      },
    },
    ticks: {
      line: {
        stroke: '#475569',
        strokeWidth: 1,
      },
      text: {
        fontSize: 11,
        fill: '#94a3b8',
      },
    },
    legend: {
      text: {
        fontSize: 12,
        fill: '#cbd5e1',
        fontWeight: 600,
      },
    },
  },
};
