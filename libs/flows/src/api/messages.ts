import { api } from '@flows/web-core';

import { encodePathSegment } from '../utils';

const _log = console.log.bind(console, '[messages-api]');

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM';
export type MessageType = 'TEXT' | 'PROPOSAL' | 'STATUS';

export interface Message {
    messageId: string;
    flowId: string;
    role: MessageRole;
    messageType: MessageType;
    content: string;
    proposalId?: string | null;
    metadata?: Record<string, unknown>;
    createdAt: string;
}

export interface ProposalBlock {
    type: string;
    label: string;
}

export interface MessageProposal {
    id: string;
    blocks: ProposalBlock[];
    edges?: Array<{ source: string; target: string }>;
    estimatedCostUsd?: number;
    description?: string;
}

export interface MessageView {
    id: string;
    flowId: string;
    role: 'user' | 'agent';
    content: string;
    proposal?: MessageProposal;
    createdAt: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const asRecord = (value: unknown): Record<string, unknown> =>
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

const toProposalBlock = (node: unknown, index: number): ProposalBlock => {
    const item = asRecord(node);
    const type = String(item.blockType ?? item.type ?? item.blockId ?? 'unknown');
    return {
        type,
        label: String(item.name ?? item.label ?? type ?? `Block ${index + 1}`),
    };
};

const toProposalEdge = (edge: unknown): { source: string; target: string } | null => {
    const item = asRecord(edge);
    const source = item.sourceNodeId ?? item.source ?? item.from;
    const target = item.targetNodeId ?? item.target ?? item.to;
    if (source === undefined || target === undefined) return null;
    return { source: String(source), target: String(target) };
};

interface RawProposal {
    proposalId: string;
    proposedNodes: unknown[];
    proposedEdges: unknown[];
    estimatedCost?: { currency: string; total: number };
}

const toMessageProposal = (proposal: RawProposal | undefined, description?: string): MessageProposal | undefined => {
    if (!proposal || proposal.proposedNodes.length === 0) return undefined;
    return {
        id: proposal.proposalId,
        blocks: proposal.proposedNodes.map(toProposalBlock),
        edges: proposal.proposedEdges
            .map(toProposalEdge)
            .filter((e): e is { source: string; target: string } => e !== null),
        estimatedCostUsd: proposal.estimatedCost?.total,
        description,
    };
};

interface MessageCreateResponse {
    message: Message;
    proposal?: RawProposal;
    assistantMessage?: Message;
}

interface MessageListResponse {
    items: Array<Message & { proposal?: RawProposal }>;
    nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SendMessageBody {
    content: string;
    currentContext?: Record<string, unknown>;
}

/**
 * Send a message to the flow agent and get the assistant reply.
 * POST /flows/{flowId}/messages
 */
export const sendFlowMessage = async (flowId: string, body: SendMessageBody): Promise<MessageView | null> => {
    _log(`> sendFlowMessage(${flowId})`, body);
    const response = await api.post<MessageCreateResponse>(
        `/flows/${encodePathSegment(flowId)}/messages`,
        body
    );
    const { assistantMessage, proposal } = response.data;
    if (!assistantMessage) return null;
    return {
        id: assistantMessage.messageId,
        flowId: assistantMessage.flowId,
        role: 'agent',
        content: assistantMessage.content,
        proposal: toMessageProposal(proposal, assistantMessage.content),
        createdAt: Date.parse(assistantMessage.createdAt),
    };
};

/**
 * Fetch the chat history for a flow.
 * GET /flows/{flowId}/messages
 */
export const getFlowMessages = async (flowId: string): Promise<MessageView[]> => {
    _log(`> getFlowMessages(${flowId})`);
    const response = await api.get<MessageListResponse>(`/flows/${encodePathSegment(flowId)}/messages`);
    return response.data.items.map(msg => ({
        id: msg.messageId,
        flowId: msg.flowId,
        role: msg.role === 'USER' ? 'user' : 'agent',
        content: msg.content,
        proposal: toMessageProposal(msg.proposal, msg.content),
        createdAt: Date.parse(msg.createdAt),
    }));
};
