#!/usr/bin/env node

/**
 * Test script to verify job stopping is working correctly
 * This will check if SLURM jobs and processes are actually being stopped
 */

const { NodeSSH } = require('node-ssh');
require('dotenv').config({ path: '.env.local' });

const NODES = [
    {
        name: "cloud-243",
        host: "cloud-243.rz.tu-clausthal.de",
        port: 22,
        user: "pr35"
    },
    {
        name: "cloud-247",
        host: "cloud-247.rz.tu-clausthal.de",
        port: 22,
        user: "pr35"
    }
];

async function checkJobStatus() {
    console.log('🧪 Testing Job Status Check\n');

    const username = process.env.SSH_USER;
    const password = process.env.SSH_PASSWORD;

    if (!username || !password) {
        console.error('❌ SSH credentials not found in .env.local');
        process.exit(1);
    }

    console.log(`📝 Checking jobs for user: ${username}\n`);

    for (const node of NODES) {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`Node: ${node.name}`);
        console.log(`${'='.repeat(70)}\n`);

        const ssh = new NodeSSH();

        try {
            await ssh.connect({
                host: node.host,
                port: node.port,
                username: username,
                password: password,
                readyTimeout: 10000
            });

            // Check SLURM jobs
            console.log(`📋 SLURM Jobs:`);
            const slurmCheck = await ssh.execCommand(`squeue -u ${username} -h 2>/dev/null || echo "SLURM not available"`);

            if (slurmCheck.stdout.includes('SLURM not available')) {
                console.log(`   ℹ️  SLURM not available on this node\n`);
            } else if (slurmCheck.stdout.trim() === '') {
                console.log(`   ✅ No SLURM jobs running\n`);
            } else {
                const jobs = slurmCheck.stdout.trim().split('\n');
                console.log(`   ⚠️  Found ${jobs.length} SLURM job(s):`);
                jobs.forEach(job => console.log(`      ${job}`));
                console.log();
            }

            // Check user processes
            console.log(`👤 User Processes:`);
            const procCheck = await ssh.execCommand(`ps -u ${username} -o pid=,comm= | grep -v "sshd\\|bash\\|ps\\|grep"`);

            if (procCheck.stdout.trim() === '') {
                console.log(`   ✅ No user processes running\n`);
            } else {
                const procs = procCheck.stdout.trim().split('\n');
                console.log(`   ⚠️  Found ${procs.length} process(es):`);
                procs.forEach(proc => console.log(`      ${proc}`));
                console.log();
            }

            // Overall status
            const hasJobs = !slurmCheck.stdout.includes('SLURM not available') && slurmCheck.stdout.trim() !== '';
            const hasProcs = procCheck.stdout.trim() !== '';

            if (!hasJobs && !hasProcs) {
                console.log(`✅ Node is CLEAN - No jobs or processes running`);
            } else {
                console.log(`⚠️  Node has ACTIVE jobs or processes`);
            }

        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
        } finally {
            ssh.dispose();
        }
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ Check complete`);
    console.log(`${'='.repeat(70)}\n`);

    console.log(`💡 INSTRUCTIONS:`);
    console.log(`   1. If you see jobs/processes above, they should be stopped during benchmark`);
    console.log(`   2. Start a benchmark and watch the server console`);
    console.log(`   3. Run this script again to verify jobs were stopped`);
    console.log(`   4. You should see "Node is CLEAN" for all nodes after benchmark starts\n`);
}

checkJobStatus().catch(console.error);
