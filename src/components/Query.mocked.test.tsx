import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Query from './Query';
import { useHyphaStore } from '../store/hyphaStore';

jest.mock('../store/hyphaStore', () => ({
    useHyphaStore: jest.fn()
}));

describe('Query UI (mocked)', () => {
    let registerService: jest.Mock;

    beforeEach(() => {
        registerService = jest.fn().mockResolvedValue(undefined);

        (useHyphaStore as unknown as jest.Mock).mockReturnValue({
            server: {
                config: {
                    workspace: 'test-workspace',
                    public_base_url: 'https://hypha.aicell.io',
                    server_url: 'https://hypha.aicell.io'
                },
                registerService
            },
            isConnected: true,
            connect: jest.fn(),
            isConnecting: false
        });

    });

    test('renders active MCP URL after service registration', async () => {
        render(<Query serviceId="query-service-fixed" />);

        await waitFor(() => {
            expect(registerService).toHaveBeenCalled();
        });

        expect(
            await screen.findByText(
                'https://hypha.aicell.io/test-workspace/mcp/query-service-fixed/mcp'
            )
        ).toBeInTheDocument();
    });

    test('copy button shows success feedback', async () => {
        const user = userEvent.setup();
        render(<Query serviceId="query-service-fixed" />);

        await waitFor(() => {
            expect(registerService).toHaveBeenCalled();
        });

        await screen.findByText(
            'https://hypha.aicell.io/test-workspace/mcp/query-service-fixed/mcp'
        );

        await user.click(screen.getByRole('button', { name: /copy/i }));

        expect(
            await screen.findByText('MCP URL copied to clipboard!')
        ).toBeInTheDocument();
    });
});
