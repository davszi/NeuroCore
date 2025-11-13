// This interface defines the shape of our mock data
interface BenchmarkRun {
  id: number;
  name: string;
  date: string;
  runtime: string;
  score: string;
}

interface Props {
  data: BenchmarkRun[];
}

export default function PerformanceBenchmarkTable({ data }: Props) {
  return (
    <div className="bg-gray-900 shadow-md rounded-lg overflow-hidden border border-gray-700">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Benchmark Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Runtime</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Performance</th>
            </tr>
          </thead>
          <tbody className="bg-gray-900 divide-y divide-gray-800">
            {data.map((run) => (
              <tr key={run.id} className="hover:bg-gray-800 transition-colors duration-150">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{run.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{run.date}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-300">{run.runtime}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-cyan-300">{run.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}