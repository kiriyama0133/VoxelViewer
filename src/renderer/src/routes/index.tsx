import { VoxelViewport } from '@renderer/components/voxel-viewport'
import { trpc } from '@renderer/lib/trpc'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useSubscription } from '@trpc/tanstack-react-query'

export const Route = createFileRoute('/')({
  component: Workspace
})

function Workspace() {
  const queryClient = useQueryClient()
  const { data: config } = useSuspenseQuery(trpc.config.get.queryOptions())
  const { data: grpcStatus } = useQuery(trpc.grpc.status.queryOptions())
  const { data: latestFrame } = useQuery(trpc.grpc.latestVoxelFrame.queryOptions())

  useSubscription(
    trpc.grpc.onVoxelFrame.subscriptionOptions(undefined, {
      onData: (nextFrame) => {
        queryClient.setQueryData(trpc.grpc.latestVoxelFrame.queryKey(), nextFrame)
      }
    })
  )

  const loadMockVoxelMap = useMutation(
    trpc.grpc.loadMockVoxelMap.mutationOptions({
      onSuccess: (frame) => {
        queryClient.setQueryData(trpc.grpc.latestVoxelFrame.queryKey(), frame)
      }
    })
  )

  const endpoint = grpcStatus?.endpoint ?? `${config.grpc.host}:${config.grpc.port}`
  const isMock = grpcStatus?.isMock ?? false

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-background p-3">
      <VoxelViewport
        frame={latestFrame ?? null}
        voxelConfig={config.voxel}
        endpoint={endpoint}
        isMock={isMock}
        onLoadMockVoxelMap={() => loadMockVoxelMap.mutate()}
        isLoadingMock={loadMockVoxelMap.isPending}
      />
    </div>
  )
}
