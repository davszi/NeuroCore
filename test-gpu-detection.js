#!/usr/bin/env node

/**
 * Test script to verify GPU detection and job stopping
 * Run this to check if the benchmark system can properly detect GPUs
 */

const { NodeSSH } = require('node-ssh');
require('dotenv').config({ path: '.env.local' });

const NODES = [
    {
        name: "cloud-243",
        host: "cloud-243.rz.tu-clausthal.de",
        port: 22,
        hasGpu: true,
        user: "pr35"
    },
    {
        name: "cloud-247",
        host: "cloud-247.rz.tu-clausthal.de",
        port: 22,
        hasGpu: true,
        user: "pr35"
    }
];

async function testGpuDetection() {
    console.log('🧪 Testing GPU Detection\n');

    const username = process.env.SSH_USER;
    const password = process.env.SSH_PASSWORD;

    if (!username || !password) {
        console.error('❌ SSH credentials not found in .env.local');
        console.error('   Please set SSH_USER and SSH_PASSWORD');
        process.exit(1);
    }

    console.log(`📝 Using SSH user: ${username}\n`);

    for (const node of NODES.filter(n => n.hasGpu)) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Testing node: ${node.name}`);
        console.log(`${'='.repeat(60)}\n`);

        const ssh = new NodeSSH();

        try {
            console.log(`🔌 Connecting to ${node.host}...`);
            await ssh.connect({
                host: node.host,
                port: node.port,
                username: username,
                password: password,
                readyTimeout: 10000
            });
            console.log(`✅ Connected successfully\n`);

            // Test nvidia-smi availability
            console.log(`🔍 Checking nvidia-smi availability...`);
            const nvidiaSmiCheck = await ssh.execCommand('which nvidia-smi');
            if (nvidiaSmiCheck.code === 0) {
                console.log(`✅ nvidia-smi found at: ${nvidiaSmiCheck.stdout}`);
            } else {
                console.log(`❌ nvidia-smi not found`);
                continue;
            }

            // Query GPUs
            console.log(`\n🎮 Querying GPUs...`);
            const gpuQuery = await ssh.execCommand('nvidia-smi --query-gpu=index,name,memory.total --format=csv,noheader,nounits');

            if (gpuQuery.code === 0 && gpuQuery.stdout.trim()) {
                const gpuLines = gpuQuery.stdout.trim().split('\n');
                console.log(`✅ Found ${gpuLines.length} GPU(s):\n`);

                gpuLines.forEach((line, idx) => {
                    const [index, name, memory] = line.split(',').map(s => s.trim());
                    console.log(`   GPU ${index}: ${name} (${memory} MiB)`);
                });
            } else {
                console.log(`❌ No GPUs detected`);
                if (gpuQuery.stderr) {
                    console.log(`   Error: ${gpuQuery.stderr}`);
                }
            }

            // Check running processes
            console.log(`\n👤 Checking user processes...`);
            const processQuery = await ssh.execCommand(`ps -u ${username} -o pid=,comm= | grep -v $$`);

            if (processQuery.stdout.trim()) {
                const processes = processQuery.stdout.trim().split('\n');
                console.log(`ℹ️  Found ${processes.length} running process(es):\n`);
                processes.slice(0, 10).forEach(proc => {
                    console.log(`   ${proc}`);
                });
                if (processes.length > 10) {
                    console.log(`   ... and ${processes.length - 10} more`);
                }
            } else {
                console.log(`ℹ️  No user processes running`);
            }

        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
        } finally {
            ssh.dispose();
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Test complete`);
    console.log(`${'='.repeat(60)}\n`);
}

testGpuDetection().catch(console.error);
