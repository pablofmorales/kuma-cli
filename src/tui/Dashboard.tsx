import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';

interface Props {
	instanceName: string;
	url: string;
}

export const Dashboard: React.FC<Props> = ({ instanceName, url }) => {
	const { exit } = useApp();
	const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

	useInput((input, key) => {
		if (input === 'q' || (input === 'c' && key.ctrl)) {
			exit();
		}
	});

	// Mock connection status for now
	useEffect(() => {
		const timer = setTimeout(() => {
			setStatus('connected');
		}, 1000);
		return () => clearTimeout(timer);
	}, []);

	return (
		<Box flexDirection="column" minHeight={10}>
			{/* Header */}
			<Box borderStyle="round" paddingX={1} justifyContent="space-between">
				<Box>
					<Text bold color="cyan">Kuma Dashboard</Text>
					<Text dimColor> | </Text>
					<Text>{instanceName}</Text>
					<Text dimColor> ({url})</Text>
				</Box>
				<Box>
					<Text color={status === 'connected' ? 'green' : 'yellow'}>
						{status.toUpperCase()}
					</Text>
				</Box>
			</Box>

			{/* Main Content Area */}
			<Box flexGrow={1} paddingX={1} paddingTop={1} flexDirection="column">
				<Text>Welcome to the Uptime Kuma TUI dashboard!</Text>
				<Box marginTop={1}>
					<Text dimColor>This is a scaffold for the real-time monitoring interface.</Text>
				</Box>
			</Box>

			{/* Footer */}
			<Box borderStyle="round" paddingX={1}>
				<Text dimColor>
					Press <Text color="yellow">q</Text> to quit • <Text color="yellow">Ctrl+C</Text> to exit
				</Text>
			</Box>
		</Box>
	);
};
