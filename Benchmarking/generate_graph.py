import pandas as pd
import json
import matplotlib.pyplot as plt

# --- CONFIGURATION ---
file_name = 'monitor_results/metrics_loader.jsonl'
output_plot_name = 'ml_benchmarks_loss_lr_comparison.png'

# --- DATA LOADING ---
data = []
try:
    with open(file_name, 'r') as f:
        for line in f:
            if line.strip():
                data.append(json.loads(line.strip()))
except FileNotFoundError:
    print(f"Error: The benchmark data file '{file_name}' was not found.")
    exit()

if not data:
    print(f"Warning: The file '{file_name}' was empty or improperly formatted.")
    exit()

# --- DATA PROCESSING ---
df = pd.DataFrame(data)
df['timestamp'] = pd.to_datetime(df['timestamp'])

# Smooth loss curve
df['smooth_loss'] = df['loss'].rolling(window=3, min_periods=1, center=True).mean()

# Calculate elapsed time
df['time_elapsed_sec'] = df['timestamp'].diff().dt.total_seconds()
df = df.dropna(subset=['time_elapsed_sec'])

# --- PERFORMANCE SUMMARY ---
print("--- Training Performance Conclusion ---")

start_loss = df['loss'].iloc[0]
end_loss = df['loss'].iloc[-1]
total_steps = df['step'].iloc[-1] - df['step'].iloc[0]
loss_change_per_step = (end_loss - start_loss) / total_steps if total_steps > 0 else 0

print(f"Initial Loss: {start_loss:.4f}")
print(f"Final Loss: {end_loss:.4f}")

if loss_change_per_step < 0:
    print(f"Conclusion: Loss is decreasing (rate: {loss_change_per_step:.5f}/step).")
elif loss_change_per_step > 0:
    print(f"Conclusion: Loss is increasing (rate: +{loss_change_per_step:.5f}/step).")
else:
    print("Conclusion: No significant loss change.")

print("\n--- Resource Consumption ---")

print(f"Average CPU Usage: {df['cpu_usage_%'].mean():.1f}%")
print(f"Average RAM Usage: {df['ram_usage_GB'].mean():.2f} GB")
print(f"Average GPU Memory: {df['gpu_mem_GB'].mean():.2f} GB")

total_time = df['time_elapsed_sec'].sum()
steps_per_second = total_steps / total_time if total_time > 0 else 0
print(f"Training Throughput: {steps_per_second:.2f} steps/second")

# --- COMBINED LOSS & LEARNING RATE PLOT ---

plt.figure(figsize=(12, 6))
plt.title("Loss and Learning Rate Comparison Over Training Steps", fontsize=16)

# Left axis = L
