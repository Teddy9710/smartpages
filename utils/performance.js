// 性能监控和工具函数
class PerformanceMonitor {
  constructor() {
    this.metrics = {};
  }

  // 记录函数执行时间
  async measureFunction(name, fn) {
    const start = performance.now();
    try {
      const result = await fn();
      const end = performance.now();
      
      if (!this.metrics[name]) {
        this.metrics[name] = [];
      }
      
      this.metrics[name].push(end - start);
      
      // 保留最近100个测量值
      if (this.metrics[name].length > 100) {
        this.metrics[name] = this.metrics[name].slice(-100);
      }
      
      return result;
    } catch (error) {
      const end = performance.now();
      console.error(`Performance measurement failed for ${name}:`, error);
      throw error;
    }
  }

  // 获取函数平均执行时间
  getAverageTime(name) {
    if (!this.metrics[name] || this.metrics[name].length === 0) {
      return 0;
    }
    
    const sum = this.metrics[name].reduce((a, b) => a + b, 0);
    return sum / this.metrics[name].length;
  }

  // 获取函数执行统计
  getStats(name) {
    if (!this.metrics[name] || this.metrics[name].length === 0) {
      return null;
    }
    
    const times = this.metrics[name];
    return {
      count: times.length,
      average: this.getAverageTime(name),
      min: Math.min(...times),
      max: Math.max(...times),
      last: times[times.length - 1]
    };
  }
}

// 错误处理工具
class ErrorHandler {
  static async safeExecute(fn, fallbackValue = null, errorMessage = '执行出错') {
    try {
      return await fn();
    } catch (error) {
      console.error(errorMessage, error);
      return fallbackValue;
    }
  }

  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  static throttle(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
}

// 全局实例
const performanceMonitor = new PerformanceMonitor();
const errorHandler = new ErrorHandler();

// 导出工具
window.ScribeUtils = {
  performanceMonitor,
  errorHandler,
  safeExecute: ErrorHandler.safeExecute,
  debounce: ErrorHandler.debounce,
  throttle: ErrorHandler.throttle
};