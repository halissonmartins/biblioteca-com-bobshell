/**
 * Barrel de componentes canônicos do design system.
 * Sempre importar a partir daqui — nunca importar direto do arquivo.
 *
 * @example
 * import { Button, Input, Modal, Table, Badge, Alert, Form } from '@/components'
 */
export { Button } from './Button'
export { Input  } from './Input'
export { Form   } from './Form'
export { Table, LoadingSpinner, EmptyState, LoadingPage } from './Table'
export { Modal  } from './Modal'
export { Badge, CopyStatusBadge, ReservationStatusBadge, BookAvailabilityBadge } from './Badge'
export { BookPlate } from './BookPlate'
export { Rating } from './Rating'
export { Alert  } from './Alert'
