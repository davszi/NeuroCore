import PerformanceBenchmarkTable from '@/components/benchmarks/PerformanceBenchmarkTable';
import MLBenchmarkChart from '@/components/benchmarks/MLBenchmarkChart';

const performanceBenchmarkData = [
  { id: 1, name: 'TFLOPS Benchmark (A100)', date: '2025-11-01', runtime: '12.5s', score: '310.2 TFLOPS' },
  { id: 2, name: 'TFLOPS Benchmark (A100)', date: '2025-10-01', runtime: '12.7s', score: '309.8 TFLOPS' },
  { id: 3, name: 'LLM-Inference (H100)', date: '2025-11-01', runtime: '4.2s', score: '802.1 tokens/s' },
  { id: 4, name: 'LLM-Inference (H100)', date: '2025-10-01', runtime: '4.1s', score: '805.5 tokens/s' },
];

const baselineTrainingData = [
  {"step": 3, "loss": 3.2747},
  {"step": 6, "loss": 3.1913},
  {"step": 9, "loss": 3.205},
  {"step": 12, "loss": 3.1959},
  {"step": 15, "loss": 3.1327},
  {"step": 18, "loss": 3.119},
  {"step": 21, "loss": 3.1716},
  {"step": 24, "loss": 3.197},
  {"step": 27, "loss": 3.1052},
  {"step": 30, "loss": 3.1863},
  {"step": 33, "loss": 3.0462},
  {"step": 36, "loss": 3.1153},
  {"step": 39, "loss": 3.1266},
  {"step": 42, "loss": 3.1127},
  {"step": 45, "loss": 3.1061}
];

// This is a *simulated* run to compare against.
const flashAttentionTrainingData = baselineTrainingData.map(d => ({
  step: d.step,
  // Simulate a slightly better (lower) loss for the comparison
  loss: d.loss * (0.95 - (d.step / 1000))
}));


export default function BenchmarksPage() {
  return (
    <div className="space-y-12">
      
      {/* --- Section 1: Performance Benchmarks --- */}
      <div>
        <h2 className="text-2xl font-semibold text-white">
          Performance Benchmarks (Are our GPUs still doing well?)
        </h2>
        <p className="text-base text-gray-400 mt-2 mb-6">
          [Comparison of default benchmarks across multiple runs - benchmarks should run e.g. every month and this view should compare performance and runtime across multiple runs, e.g. the last year]
        </p>
        <PerformanceBenchmarkTable data={performanceBenchmarkData} />
      </div>

      {/* --- Section 2: ML Benchmarks --- */}
      <div>
        <h2 className="text-2xl font-semibold text-white">
          ML Benchmarks
        </h2>
        <p className="text-base text-gray-400 mt-2 mb-6">
          [How do different design choices affect transformer performance during training and inference? e.g., flash attention, zig zag ring attention, dtype (e.g., float32, bfloat32), sequence lengths, KV-caching]
        </p>
        
        {/* This grid stacks on mobile and is side-by-side on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Configuration Table */}
          <div className="lg:col-span-1 bg-gray-900 border border-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-medium text-white mb-4">Run Configurations</h3>
            <table className="min-w-full">
              <thead className="border-b border-gray-600">
                <tr>
                  <th className="text-left text-sm text-gray-400 pb-2">Parameter</th>
                  <th className="text-left text-sm text-gray-400 pb-2">Baseline</th>
                  <th className="text-left text-sm text-gray-400 pb-2">Test Run</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                <tr className="font-mono text-sm">
                  <td className="py-2 text-gray-300">Model</td>
                  <td className="py-2 text-gray-300">Llama-7B</td>
                  <td className="py-2 text-gray-300">Llama-7B</td>
                </tr>
                <tr className="font-mono text-sm">
                  <td className="py-2 text-gray-300">DType</td>
                  <td className="py-2 text-gray-300">bfloat16</td>
                  <td className="py-2 text-gray-300">bfloat16</td>
                </tr>
                <tr className="font-mono text-sm">
                  <td className="py-2 text-gray-300">Flash Attn.</td>
                  <td className="py-2 text-red-400">False</td>
                  <td className="py-2 text-green-400">True</td>
                </tr>
                <tr className="font-mono text-sm">
                  <td className="py-2 text-gray-300">Seq. Length</td>
                  <td className="py-2 text-gray-300">4096</td>
                  <td className="py-2 text-gray-300">4096</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Chart */}
          <div className="lg:col-span-2 bg-gray-900 border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-medium text-white mb-4">
              Training Loss Comparison (Baseline vs. Flash Attention)
            </h3>
            <div className="h-80"> {/* Set a fixed height for the chart container */}
              <MLBenchmarkChart 
                baselineData={baselineTrainingData} 
                flashData={flashAttentionTrainingData} 
              />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}