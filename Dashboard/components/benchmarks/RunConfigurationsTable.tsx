interface RunConfig {
  parameter: string;
  baseline: string;
  testRun: string;
}

export default function RunConfigurationsTable() {
  const configs: RunConfig[] = [
    { parameter: 'Model', baseline: 'GPT-2', testRun: 'GPT-2' },
    { parameter: 'DType', baseline: 'bfloat16', testRun: 'bfloat16' },
    { parameter: 'Flash Attn.', baseline: 'False', testRun: 'True' },
    { parameter: 'Seq. Length', baseline: '4096', testRun: '4096' },
  ];

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Run Configurations</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-3 px-4 text-gray-300 font-semibold">Parameter</th>
              <th className="text-left py-3 px-4 text-gray-300 font-semibold">SDPA Attention</th>
              <th className="text-left py-3 px-4 text-gray-300 font-semibold">Flash Attention</th>
            </tr>
          </thead>
          <tbody>
            {configs.map((config, index) => (
              <tr key={index} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                <td className="py-3 px-4 text-gray-400">{config.parameter}</td>
                <td className="py-3 px-4">
                  {config.parameter === 'Flash Attn.' && config.baseline === 'False' ? (
                    <span className="text-red-400">{config.baseline}</span>
                  ) : (
                    <span className="text-gray-300">{config.baseline}</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  {config.parameter === 'Flash Attn.' && config.testRun === 'True' ? (
                    <span className="text-green-400">{config.testRun}</span>
                  ) : (
                    <span className="text-gray-300">{config.testRun}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

